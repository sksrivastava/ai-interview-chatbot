import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css'; // We'll create this later for styling

const API_BASE_URL = 'http://localhost:3001/api'; // Assuming backend runs on port 3001

// Check for SpeechRecognition API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.continuous = true; // Set to true to keep listening
  recognition.interimResults = true; // Get interim results for more responsive UI if desired (optional)
  recognition.lang = 'en-US'; // Set language
}

function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [interviewId, setInterviewId] = useState(null);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isTTSEnabled, setIsTTSEnabled] = useState(true); // For Text-to-Speech

  // States for Speech-to-Text (STT)
  const [isListening, setIsListening] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]); // Store available TTS voices
  const [speakingMessageId, setSpeakingMessageId] = useState(null); // To track which message is speaking

  const [adminPassword, setAdminPassword] = useState('');
  const [modalFeedbackContent, setModalFeedbackContent] = useState('');
  const [showFeedbackButtonVisible, setShowFeedbackButtonVisible] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Populate available voices when they are loaded by the browser
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        console.log('Available TTS voices:', voices.map(v => ({name: v.name, lang: v.lang, default: v.default, localService: v.localService, voiceURI: v.voiceURI })));
      } else {
        // Fallback if voices array is empty initially
        setTimeout(loadVoices, 100); 
      }
    };

    if (typeof window.speechSynthesis !== 'undefined') {
      // Check if voices are already loaded
      if (window.speechSynthesis.getVoices().length > 0) {
        loadVoices();
      } else {
        // Wait for voices to be loaded
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
    // Cleanup
    return () => {
      if (typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel(); // Cancel any speech on unmount
      }
    };
  }, []);

  // Function to speak text using browser's TTS
  const speakText = (text, messageId) => {
    if (isTTSEnabled && text && typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);

      let voiceUsedInfo = 'Default browser voice';

      // --- !! IMPORTANT FOR DEBUGGING VOICE ISSUES !! ---
      // 1. Check your browser console for the full "Available TTS voices:" log.
      // 2. Pick a promising voice NAME (and optionally LANG) from that log.
      // 3. Paste the EXACT name into PREFERRED_VOICE_NAME_FORCED below.
      //    If the voice is specific to a language variant (e.g., en-GB vs en-US for the same voice name),
      //    you might also need to set PREFERRED_VOICE_LANG_FORCED.
      const PREFERRED_VOICE_NAME_FORCED = ""; // <<--- PASTE EXACT VOICE NAME HERE FOR TESTING (e.g., "Google US English")
      const PREFERRED_VOICE_LANG_FORCED = "en";   // <<--- PASTE EXACT LANG PREFIX HERE IF NEEDED (e.g., "en-US", "en-GB", or just "en")
      // --- End Debugging Section ---

      if (availableVoices.length > 0) {
        let selectedVoice = null;

        if (PREFERRED_VOICE_NAME_FORCED) {
            selectedVoice = availableVoices.find(voice => 
                voice.name === PREFERRED_VOICE_NAME_FORCED && 
                (PREFERRED_VOICE_LANG_FORCED ? voice.lang.startsWith(PREFERRED_VOICE_LANG_FORCED) : true)
            );
            if (selectedVoice) {
                voiceUsedInfo = `Attempting FORCED voice: ${selectedVoice.name} (Lang: ${selectedVoice.lang})`;
            } else {
                voiceUsedInfo = `FORCED voice "${PREFERRED_VOICE_NAME_FORCED}" not found or lang mismatch. Trying automatic selection...`;
            }
        }

        if (!selectedVoice) { // Fallback to automatic selection if forced voice not set, not found, or lang mismatch
            selectedVoice = availableVoices.find(voice => 
                voice.lang.startsWith('en') &&
                (voice.name.toLowerCase().includes('female') || 
                 (voice.name.toLowerCase().includes('google') && voice.name.toLowerCase().includes('english')) || 
                 voice.name.toLowerCase().includes('zira') || 
                 voice.name.toLowerCase().includes('samantha') || 
                 voice.name.toLowerCase().includes('microsoft eva'))
            );
            if (selectedVoice) {
                 voiceUsedInfo = `Auto-selected (preferred keyword): ${selectedVoice.name} (Lang: ${selectedVoice.lang})`;
            }
        }

        if (!selectedVoice) { // Fallback to any local English voice
          selectedVoice = availableVoices.find(voice => voice.lang.startsWith('en') && voice.localService);
          if (selectedVoice) {
            voiceUsedInfo = `Auto-selected (local English): ${selectedVoice.name} (Lang: ${selectedVoice.lang})`;
          }
        }
        
        if (!selectedVoice) { // Fallback to any English voice
          selectedVoice = availableVoices.find(voice => voice.lang.startsWith('en'));
          if (selectedVoice) {
            voiceUsedInfo = `Auto-selected (any English): ${selectedVoice.name} (Lang: ${selectedVoice.lang})`;
          }
        }

        if (selectedVoice) {
          utterance.voice = selectedVoice;
        } else {
          // This means no English voice was found at all, will use absolute browser default.
          voiceUsedInfo = 'No suitable English voice found, using absolute browser default.';
        }
      }
      console.log('TTS Debug - Using voice:', voiceUsedInfo);
      
      // --- Experiment with these values --- 
      utterance.pitch = 1;    // Range 0-2. Default is 1.
      utterance.rate = 1.0;   // Range 0.1-10. Default is 1. (Changed from 0.95)
      // --- End Experiment --- 

      utterance.onstart = () => {
        setSpeakingMessageId(messageId);
      };
      utterance.onend = () => {
        setSpeakingMessageId(null);
      };
      utterance.onerror = (event) => {
        console.error('SpeechSynthesis Error', event);
        setSpeakingMessageId(null);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      // If TTS is disabled or not available, ensure speakingMessageId is cleared
      setSpeakingMessageId(null);
    }
  };

  // --- Speech-to-Text (STT) Handlers ---
  const handleToggleListen = () => {
    if (!recognition) {
      alert('Speech recognition is not supported by your browser.');
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    if (!recognition) return;

    recognition.onstart = () => {
      console.log('Voice recognition started.');
      setIsListening(true);
      // setUserInput(''); // Optionally clear input when starting to record new answer
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      // Update userInput with the latest final transcript segment
      // This will append if user pauses and resumes, effectively creating continuous input
      if (finalTranscript) {
          console.log('Finalized part of speech:', finalTranscript);
          setUserInput(prevUserInput => (prevUserInput ? prevUserInput + ' ' : '') + finalTranscript.trim());
      }
      // Optionally, you could display interimTranscript in the UI for real-time feedback
      // console.log('Interim transcript:', interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      alert(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('Voice recognition ended.');
      setIsListening(false);
    };

    // Cleanup: remove event listeners when component unmounts
    return () => {
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop(); // Ensure it stops if component unmounts while listening
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount
  // --- End STT Handlers ---

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    if (fileType === 'resume') {
      setResumeFile(file);
    } else if (fileType === 'jobDescription') {
      setJobDescriptionFile(file);
    }
  };

  const canStartInterview = !!resumeFile && !!jobDescriptionFile;

  const handleStartInterview = async () => {
    if (!resumeFile || !jobDescriptionFile) {
        alert('Please upload both a resume file and a job description file.');
        return;
    }

    setIsLoading(true);
    setMessages([]);
    setFeedback('');

    let uploadedResumeText = '';
    let uploadedJobDescriptionText = '';

    const formData = new FormData();
    if (resumeFile) {
        formData.append('resume', resumeFile);
    }
    if (jobDescriptionFile) {
        formData.append('jobDescription', jobDescriptionFile);
    }

    try {
      if (resumeFile || jobDescriptionFile) { 
        const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        uploadedResumeText = uploadResponse.data.resumeText || '';
        uploadedJobDescriptionText = uploadResponse.data.jobDescriptionText || '';
      }

      if (!uploadedResumeText) {
        alert('Failed to extract text from resume. Please check the file or try a different one.');
        setIsLoading(false);
        return;
      }
      if (!uploadedJobDescriptionText) { 
        alert('Job description text could not be extracted. Please upload a valid job description file.');
        setIsLoading(false);
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/interview/start`, {
        resumeText: uploadedResumeText,
        jobDescriptionText: uploadedJobDescriptionText
      });

      setInterviewId(response.data.interviewId);
      const firstQuestionText = response.data.firstQuestion;
      const firstQuestionId = `ai-${Date.now()}`;
      setMessages([{ id: firstQuestionId, sender: 'ai', text: firstQuestionText }]);
      setIsInterviewActive(true);
    } catch (error) {
      console.error('Error starting interview:', error.response ? error.response.data : error.message);
      alert(`Failed to start interview. ${error.response?.data?.message || 'Please check console for details.'}`);
    }
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !isInterviewActive) return;
    const newMessages = [...messages, { sender: 'user', text: userInput }];
    setMessages(newMessages);
    const currentMessage = userInput;
    setUserInput('');
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/interview/chat`, {
        interviewId: interviewId,
        userAnswer: currentMessage,
      });
      const aiResponseText = response.data.nextQuestion;
      const aiMessageId = `ai-${Date.now()}`;
      const newAiMessage = { id: aiMessageId, sender: 'ai', text: aiResponseText };
      setMessages([...newMessages, newAiMessage]);
      // speakText(aiResponseText, aiMessageId); // Auto-speak is currently disabled

      console.log('[DEBUG App.jsx] Received data from /api/interview/chat:', response.data); // Enhanced log

      if (response.data.shouldEndInterview) {
        console.log('[DEBUG App.jsx] AI signaled to end the interview (shouldEndInterview: true).');
        // Display AI's final message (already added to messages by this point)
        setIsInterviewActive(false); // Stop further input, hide chat controls
        setShowFeedbackButtonVisible(true); // Show button to access feedback (admin)
        
        // Explicitly stop STT and TTS if active when AI ends interview
        if (recognition && isListening) {
          console.log('AI ending interview, stopping STT.');
          recognition.stop();
        }
        if (typeof window.speechSynthesis !== 'undefined' && window.speechSynthesis.speaking) {
          console.log('AI ending interview, cancelling TTS.');
          window.speechSynthesis.cancel();
          setSpeakingMessageId(null);
        }
      } else {
        // If interview continues, do nothing specific here regarding buttons
      }

    } catch (error) {
      console.error('Error sending message:', error.response ? error.response.data : error.message);
      alert(`Failed to send message. ${error.response?.data?.message || 'Please check console for details.'}`);
      setMessages(newMessages);
    }
    setIsLoading(false);
  };

  const handleEndInterview = async () => {
    if (!interviewId) return;

    // Stop active STT (if any)
    if (recognition && isListening) {
      console.log('User manually ending interview, stopping STT.');
      recognition.stop();
    }
    // Stop active TTS (if any)
    if (typeof window.speechSynthesis !== 'undefined') {
      console.log('User manually ending interview, cancelling TTS.');
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    }

    setIsLoading(true);
    try {
      // The /api/interview/end now just finalizes status and ensures feedback is generated if needed.
      // It no longer returns the feedback text directly in this response.
      await axios.post(`${API_BASE_URL}/interview/end`, { interviewId });
      console.log('[DEBUG App.jsx] Interview ended via /api/interview/end. ID:', interviewId);
      
      setMessages(prevMessages => [...prevMessages, {id: `system-${Date.now()}`, sender: 'system', text: 'Interview Ended.'}]);
      setIsInterviewActive(false);
      setShowFeedbackButtonVisible(true); // Show button to access feedback (admin)
    } catch (error) {
      console.error('Error ending interview:', error.response ? error.response.data : error.message);
      alert(`Failed to end interview. ${error.response?.data?.message || 'Please check console for details.'}`);
      // Potentially set isLoading false here if we don't proceed to feedback state
    }
    setIsLoading(false);
  };

  const handleStartNewInterview = () => {
    setMessages([]);
    setInterviewId(null);
    setIsInterviewActive(false);
    setResumeFile(null);
    setJobDescriptionFile(null);
    setUserInput('');
    setIsLoading(false);

    // Reset TTS/STT states
    if (recognition && isListening) {
      recognition.stop(); 
    }
    setIsListening(false);
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    // isTTSEnabled can remain as user preference

    // Reset feedback/modal states
    setShowFeedbackButtonVisible(false);
    setIsFeedbackModalOpen(false);
    setAdminPassword('');
    setModalFeedbackContent('');
    
    // Clear file input fields visually (optional but good UX)
    const resumeInput = document.getElementById('resume');
    if (resumeInput) resumeInput.value = null;
    const jdInput = document.getElementById('jobDescriptionFile');
    if (jdInput) jdInput.value = null;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Interviewer</h1>
        <div className="tts-toggle">
          <label htmlFor="tts-checkbox">Enable AI Voice: </label>
          <input 
            type="checkbox" 
            id="tts-checkbox"
            checked={isTTSEnabled} 
            onChange={() => setIsTTSEnabled(!isTTSEnabled)} 
          />
        </div>
      </header>
      <main className="App-main">
        {!isInterviewActive && !feedback && (
          <section className="setup-section">
            <h2>Setup Interview</h2>
            <div>
              <label htmlFor="resume">Upload Resume:</label>
              <input type="file" id="resume" accept=".pdf,.doc,.docx,.txt" onChange={(e) => handleFileChange(e, 'resume')} />
            </div>
            <div>
              <label htmlFor="jobDescriptionFile">Upload Job Description:</label>
              <input type="file" id="jobDescriptionFile" accept=".pdf,.doc,.docx,.txt" onChange={(e) => handleFileChange(e, 'jobDescription')} />
            </div>
            <button onClick={handleStartInterview} disabled={isLoading || !canStartInterview}>
              {isLoading ? 'Starting...' : 'Start Interview'}
            </button>
          </section>
        )}

        {(isInterviewActive || feedback) && (
          <section className="interview-section">
            <h2>Interview</h2>
            <div className="chat-window">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className={`message ${msg.sender}`}>
                  <strong>{msg.sender === 'ai' ? 'AI' : (msg.sender === 'user' ? 'You' : 'System')}:</strong> 
                  <span style={{ paddingRight: '25px' }}>{msg.text}</span>
                  {msg.sender === 'ai' && (
                    <div className="speaker-button-container">
                      <button 
                        onClick={() => {
                          if (speakingMessageId === msg.id && window.speechSynthesis.speaking) {
                            window.speechSynthesis.cancel();
                            setSpeakingMessageId(null);
                          } else {
                            speakText(msg.text, msg.id);
                          }
                        }}
                        className="speaker-button"
                        title={speakingMessageId === msg.id && window.speechSynthesis.speaking ? 'Stop Speech' : 'Play Speech'}
                      >
                        {speakingMessageId === msg.id && window.speechSynthesis.speaking ? '⏹️' : '▶️'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} /> 
            </div>

            {isInterviewActive && (
              <div className="chat-input">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                  placeholder="Type your answer or use the microphone..."
                  disabled={isLoading}
                />
                <button onClick={handleSendMessage} disabled={isLoading || !userInput.trim()} className="send-icon-button" title="Send">
                  &#10148; {/* Send icon (Unicode arrow) */}
                </button>
                {recognition && (
                  <button 
                    onClick={handleToggleListen} 
                    disabled={isLoading} 
                    className="mic-button"
                    style={{ backgroundColor: isListening ? 'red' : '' }} // Conditional styling
                  >
                    {isListening ? 'Stop Listening' : 'Record Answer'}
                  </button>
                )}
              </div>
            )}

            {isInterviewActive && (
              <button onClick={handleEndInterview} disabled={isLoading} className="end-interview-btn">
                {isLoading ? 'Ending...' : 'End Interview'}
              </button>
            )}

            {/* Show these buttons only when an interview has finished but not in setup phase */}
            {!isInterviewActive && interviewId && (
              <div className="post-interview-actions">
                {showFeedbackButtonVisible && (
                  <button onClick={() => setIsFeedbackModalOpen(true)} className="view-feedback-btn">
                    View Feedback (Admin)
                  </button>
                )}
                <button onClick={handleStartNewInterview} className="start-new-interview-btn">
                  Start New Interview
                </button>
              </div>
            )}

            {isFeedbackModalOpen && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>View Interview Feedback</h3>
                  {!modalFeedbackContent ? (
                    <>
                      <p>Enter admin password to view feedback:</p>
                      <input 
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Admin Password"
                        className="admin-password-input"
                      />
                      <button onClick={async () => {
                        if (adminPassword === 'admin') {
                          setIsLoading(true);
                          try {
                            const response = await axios.get(`${API_BASE_URL}/interview/feedback/${interviewId}`);
                            setModalFeedbackContent(response.data.feedback || 'No feedback content available.');
                          } catch (err) {
                            console.error("Error fetching feedback:", err);
                            setModalFeedbackContent('Failed to load feedback. ' + (err.response?.data?.error || err.message));
                          }
                          setIsLoading(false);
                        } else {
                          alert('Incorrect password.');
                        }
                        setAdminPassword(''); // Clear password after attempt
                      }} disabled={isLoading} className="submit-password-btn">
                        {isLoading ? 'Loading...' : 'Show Feedback'}
                      </button>
                    </>
                  ) : (
                    <div className="feedback-display-area">
                      {modalFeedbackContent.split('\n').map((line, index) => (
                        <p key={index} style={{ marginBottom: '0.5em' }}>{line}</p>
                      ))}
                    </div>
                  )}
                  <button onClick={() => {
                    setIsFeedbackModalOpen(false);
                    setAdminPassword(''); 
                    // Keep modalFeedbackContent so it doesn't refetch if modal is reopened, unless a new interview starts
                  }} className="close-modal-btn">
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* This feedback section is now effectively replaced by the modal logic */}
            {/* {feedback && (
              <div className="feedback-section">
                <h3>Interview Feedback</h3>
                {feedback.split('\n').map((line, index) => (
                  <p key={index} style={{ marginBottom: '0.5em' }}>{line}</p>
                ))}
                <button onClick={handleStartNewInterview}>
                  Start New Interview
                </button>
              </div>
            )} */}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
