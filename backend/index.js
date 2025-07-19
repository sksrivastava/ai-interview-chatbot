const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
// const OpenAI = require('openai'); // No longer directly using OpenAI library
const axios = require('axios'); // For OpenRouter API calls
const textract = require('textract'); // For extracting text from files
const path = require('path'); // For handling file paths/extensions
const fs = require('fs'); // For saving temporary files if needed (though we'll try direct buffer)

// --- CONFIGURATION ---
// Set to true to bypass OpenAI calls and use mock data for testing other parts of the app.
const MOCK_AI_CALLS = false; // CHANGE THIS TO false WHEN READY TO USE OPENROUTER
const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-3.5-turbo'; // Or e.g., 'anthropic/claude-3-haiku-20240307' for Claude Haiku
// ---------------------

const app = express();
const port = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://www.example.com';
const supabaseKey = process.env.SUPABASE_KEY || 'supabase-mock-key';
if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key not found. Please check your .env file.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenRouter API key - only if not mocking
let openRouterApiKey;
if (!MOCK_AI_CALLS) {
  openRouterApiKey = process.env.OPENROUTER_API_KEY || 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000';
  if (!openRouterApiKey) {
    console.error('OPENROUTER_API_KEY not found for non-mock calls. Please check your .env file.');
    process.exit(1);
  }
} else {
  console.warn('WARN: MOCK_AI_CALLS is true. AI calls will not be made. Using placeholder AI responses.');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup multer for file uploads
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB limit for individual files

const storage = multer.memoryStorage(); // Store files in memory as buffers
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

// --- HELPER FUNCTION FOR FEEDBACK GENERATION ---
async function generateFeedbackText(interviewId, resumeText, jobDescriptionText, transcript) {
  if (MOCK_AI_CALLS) {
    return "(Mock AI) Overall, a good interview. Consider elaborating more on your project experiences next time.";
  }

  // Summarize Resume and JD for feedback prompt
  const summarizedResumeText = await getSummarizedText(resumeText, "candidate experience evaluation for final interview feedback", 700);
  const summarizedJobDescriptionText = await getSummarizedText(jobDescriptionText, "job requirements analysis for final interview feedback", 700);

  const conversationHistoryForFeedback = (transcript || []).map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.text }));

  const newSystemPromptForFeedback = `You are an expert interviewer and talent acquisition specialist.
Based on the provided Resume Summary, Job Description Summary, and the full Interview Transcript, provide comprehensive feedback for the candidate.

Your feedback should include:
1. A brief summary of the candidate's performance during the interview.
2. Strengths demonstrated by the candidate relevant to the job description summary.
3. Areas for improvement or aspects where the candidate could have been more convincing.
4. An overall assessment of the candidate's suitability for the role described in the Job Description Summary. Clearly state whether you consider the candidate a strong fit, a potential fit (mentioning any gaps), or not a good fit at this time, and provide a concise justification for your assessment.

Resume Summary: ${summarizedResumeText}
Job Description Summary: ${summarizedJobDescriptionText}

Interview Transcript is provided next. Focus your feedback on the transcript content in light of the resume and JD summaries.`;

  const messagesForApi = [
    { role: "system", content: newSystemPromptForFeedback },
    ...conversationHistoryForFeedback
  ];

  const completionData = await getOpenRouterCompletion(messagesForApi, OPENROUTER_DEFAULT_MODEL, 500);
  console.log('--- OpenRouter API Response in generateFeedbackText (completionData) ---');
  console.log(JSON.stringify(completionData, null, 2));

  if (completionData && Array.isArray(completionData.choices) && completionData.choices.length > 0 && completionData.choices[0].message) {
    return completionData.choices[0].message.content?.trim() || "Thank you for your time. (Feedback generation failed or was empty)";
  } else {
    console.error('Error: Invalid or empty completionData.choices from OpenRouter during feedback generation. Full response:', JSON.stringify(completionData, null, 2));
    return "Thank you for your time. (AI feedback generation failed)"; // Fallback feedback
  }
}
// --- END HELPER FUNCTION ---

app.get('/', (req, res) => {
  res.send('AI Interviewer Backend is running!');
});

// API Endpoints (to be implemented)

// 1. File Upload (Resume and Job Description) - NOW EXTRACTS TEXT
app.post('/api/upload', upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'jobDescription', maxCount: 1 }]), async (req, res) => {
  let resumeText = '';
  let jobDescriptionText = '';
  let errors = {};

  const extractTextFromFile = async (file) => {
    if (!file) return '';
    return new Promise((resolve, reject) => {
      // textract can sometimes be slow with direct buffers for certain types,
      // or might require a filepath. For simplicity, we'll try with buffer.
      // If issues arise, saving to a temp file and passing path to textract is more robust.
      textract.fromBufferWithName(file.originalname, file.buffer, (error, text) => {
        if (error) {
          console.error('Textract error for file:', file.originalname, error);
          // Return a partial error, try to extract from other file if present
          reject(`Failed to extract text from ${file.originalname}: ${error.message}`);
        } else {
          resolve(text);
        }
      });
    });
  };

  try {
    if (req.files.resume && req.files.resume[0]) {
      console.log('Processing resume file:', req.files.resume[0].originalname);
      try {
        resumeText = await extractTextFromFile(req.files.resume[0]);
      } catch (e) {
        errors.resume = e;
      }
    } else {
      // Allow empty resume if jobDescription is primary focus for this endpoint call,
      // or handle as error if both are always required from upload.
      // For now, just means resumeText will be empty.
      console.log('No resume file uploaded.');
    }

    if (req.files.jobDescription && req.files.jobDescription[0]) {
      console.log('Processing job description file:', req.files.jobDescription[0].originalname);
      try {
        jobDescriptionText = await extractTextFromFile(req.files.jobDescription[0]);
      } catch (e) {
        errors.jobDescription = e;
      }
    } else {
      console.log('No job description file uploaded.');
    }
    
    if (Object.keys(errors).length > 0) {
        // If one file failed but the other succeeded, we might still want to return partial success
        // For now, returning 400 if any extraction fails.
        return res.status(400).json({ 
            message: 'Error during text extraction.', 
            errors,
            resumeText: resumeText, // send successfully extracted text if any
            jobDescriptionText: jobDescriptionText // send successfully extracted text if any
        });
    }

    res.json({
      message: 'Files processed.',
      resumeText: resumeText || '', // Ensure empty string if not extracted
      jobDescriptionText: jobDescriptionText || '' // Ensure empty string if not extracted
    });

  } catch (error) {
    // This catch is for unexpected errors in the overall try block, not multer or textract specific errors
    console.error('Error in /api/upload:', error);
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` });
      }
      return res.status(400).json({ message: `File upload error: ${error.message}` });
    }
    res.status(500).json({ message: 'Server error during file upload processing.' });
  }
});

// 2. Start Interview (Initial question generation)
app.post('/api/interview/start', async (req, res) => {
  let { resumeText, jobDescriptionText } = req.body;

  console.log('--- Raw input from req.body ---');
  console.log('Type of resumeText:', typeof resumeText);
  console.log('resumeText (raw snippet):', String(resumeText).substring(0, 100)); // Log a snippet
  console.log('Type of jobDescriptionText:', typeof jobDescriptionText);
  console.log('jobDescriptionText (raw snippet):', String(jobDescriptionText).substring(0, 100)); // Log a snippet

  if (!resumeText || !jobDescriptionText) {
    return res.status(400).json({ error: 'Resume text and Job Description text are required.' });
  }

  try {
    console.log('--- Before sanitization ---');
    if (typeof resumeText === 'string') {
      console.log('resumeText (before sanitization, JSON.stringify):', JSON.stringify(resumeText.substring(0,200))); // Log snippet
    }
    if (typeof jobDescriptionText === 'string') {
      console.log('jobDescriptionText (before sanitization, JSON.stringify):', JSON.stringify(jobDescriptionText.substring(0,200))); // Log snippet
    }

    // Sanitize resumeText and jobDescriptionText to remove null characters
    if (typeof resumeText === 'string') {
      resumeText = resumeText.replace(/\u0000/g, '');
    } else {
      // Ensure it's at least an empty string if it was not a string (e.g. null or undefined passed somehow)
      // Though the initial check should prevent this state for resumeText/jobDescriptionText.
      resumeText = ''; 
    }

    if (typeof jobDescriptionText === 'string') {
      jobDescriptionText = jobDescriptionText.replace(/\u0000/g, '');
    } else {
      jobDescriptionText = '';
    }

    console.log('--- After sanitization ---');
    console.log('resumeText (after sanitization, JSON.stringify):', JSON.stringify(resumeText.substring(0,200)));
    console.log('jobDescriptionText (after sanitization, JSON.stringify):', JSON.stringify(jobDescriptionText.substring(0,200)));

    // --- Summarize Resume and JD if they are too long ---
    // Target ~700 tokens for each summary to leave room for other prompt parts & response
    // Adjust targetTokenCount as needed. Max for gpt-3.5-turbo is ~4k for prompt, but we need room for questions too.
    const summarizedResumeText = await getSummarizedText(resumeText, "candidate experience evaluation for an interview", 700);
    const summarizedJobDescriptionText = await getSummarizedText(jobDescriptionText, "job requirements analysis for an interview", 700);
    // ---

    let firstQuestion = "(Mock AI) Tell me about your experience with a relevant skill from the JD?";

    if (!MOCK_AI_CALLS) {
      const prompt = `You are an AI interviewer. Your task is to formulate an engaging opening interview question.\n\nUse the **Job Description Summary** below to understand the requirements and skills needed for the role.\nUse the **Resume Summary** below to understand the candidate\'s experience.\n\nBased on BOTH, ask an initial question that either:\na) Asks the candidate to elaborate on a specific experience from their **Resume Summary** that seems relevant to a key requirement in the **Job Description Summary**.\nOR\nb) Poses a general question about their interest or suitability for the role, referencing a key aspect of the **Job Description Summary**.\n\nDo NOT assume the Job Description is the candidate's experience.\n\nJob Description Summary:\n${summarizedJobDescriptionText}\n\nResume Summary:\n${summarizedResumeText}\n\nOpening Question:`;

      const completionData = await getOpenRouterCompletion([{ role: "user", content: prompt }]);
      console.log('--- OpenRouter API Response (completionData) ---');
      console.log(JSON.stringify(completionData, null, 2));

      if (completionData && Array.isArray(completionData.choices) && completionData.choices.length > 0 && completionData.choices[0].message) {
        firstQuestion = completionData.choices[0].message.content?.trim() || "Tell me about yourself.";
      } else {
        console.error('Error: Invalid or empty completionData.choices from OpenRouter. Full response:', JSON.stringify(completionData, null, 2));
        firstQuestion = "Tell me about yourself. (AI question generation failed)"; // Fallback question
      }
    }

    // Sanitize firstQuestion as well, just in case
    if (typeof firstQuestion === 'string') {
        firstQuestion = firstQuestion.replace(/\u0000/g, '');
    } else {
        firstQuestion = "Error: Could not generate a valid first question."; // Fallback
    }
    console.log('Sanitized firstQuestion:', JSON.stringify(firstQuestion));

    const initialTranscript = [{ sender: 'ai', text: firstQuestion, timestamp: new Date().toISOString() }];

    // --- DIAGNOSTIC LOGS & PAYLOAD ADJUSTMENT ---
    console.log('--- Supabase Key & User ID Information ---');
    console.warn('Reminder: For backend operations requiring direct data modification (like this insert),');
    console.warn('it is common to use the SERVICE_ROLE_KEY for process.env.SUPABASE_KEY to bypass RLS.');
    console.warn('If using the ANON_KEY, ensure your RLS policies explicitly allow this server-side insert, potentially requiring a user_id.');
    console.log('The key being used is from process.env.SUPABASE_KEY. Please verify it in your .env file.');
    
    // Placeholder for user_id. For a real application, this would come from user authentication
    // or be a system-defined identifier if appropriate.
    // If user_id is nullable and not used in RLS for service_role key, you might not need it.
    // If it IS required by schema (NOT NULL) or RLS (even with service_role for some complex policies/triggers), it must be provided.
    const placeholderUserId = 'service-generated-interview-id'; // Example placeholder

    console.log('Attempting to insert into interviews table (with .select().single())...');
    const insertPayload = {
      resume_text: resumeText,
      job_description_text: jobDescriptionText,
      transcript: initialTranscript,
      status: 'started',
      user_id: placeholderUserId, 
    };
    console.log('Insert payload:', JSON.stringify(insertPayload, null, 2));
    // --- END DIAGNOSTIC LOGS & PAYLOAD ADJUSTMENT ---

    const { data, error: dbError } = await supabase
      .from('interviews')
      .insert(insertPayload) // Using the modified payload
      .select('id')
      .single();

    if (dbError) {
      console.error('--- Supabase dbError Encountered (from actual insert with select().single(), before throwing) ---');
      console.error('Type of dbError:', typeof dbError);
      if (dbError instanceof Error) {
        console.error('dbError is an instance of Error');
      } else {
        console.error('dbError is NOT an instance of Error');
      }
      if (dbError.message) console.error('dbError Message:', dbError.message);
      if (dbError.code) console.error('dbError Code:', dbError.code);
      if (dbError.details) console.error('dbError Details:', dbError.details);
      if (dbError.hint) console.error('dbError Hint:', dbError.hint);
      if (dbError.stack) console.error('dbError Stack:', dbError.stack);
      console.error('Iterating over dbError properties (for...in):');
      let hasProps = false;
      for (const key in dbError) {
        if (Object.prototype.hasOwnProperty.call(dbError, key)) {
          hasProps = true;
          try {
            console.error(`  dbError[${key}]:`, dbError[key]);
          } catch (e) {
            console.error(`  Error accessing dbError[${key}]:`, e.message);
          }
        }
      }
      if (!hasProps) {
        console.error('  No enumerable properties found in dbError with for...in.');
      }
      console.error('dbError Full object (console.dir):');
      console.dir(dbError, { depth: null, showHidden: true });
      console.error('dbError Full object (JSON.stringify with Object.getOwnPropertyNames):', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError), 2));
      console.error('dbError Full object (JSON.stringify direct):', JSON.stringify(dbError, null, 2));
      throw dbError; 
    }
    
    if (!data || !data.id) { 
      console.error('Supabase insert succeeded (no dbError) but data or data.id is missing. Data:', data);
      throw new Error('Failed to create interview session in DB or retrieve ID after insert.');
    }
    
    console.log('Insert into interviews table succeeded. Interview ID:', data.id);
    res.json({ firstQuestion, interviewId: data.id });

  } catch (error) {
    console.error('--- Error starting interview (main catch block) --- ');
    if (error.message) console.error('Message:', error.message);
    if (error.code) console.error('Code:', error.code);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    console.error('Full error object (console.dir):');
    console.dir(error, { depth: null });
    console.error('Full error object (JSON.stringify):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    const responseError = {
        error: 'Failed to start interview',
        message: error.message || 'An unexpected error occurred.',
        code: error.code, 
        details: error.details, 
        hint: error.hint 
    };
    res.status(500).json(responseError);
  }
});

// 3. Chat (User response and next question)
app.post('/api/interview/chat', async (req, res) => {
  const { interviewId, userAnswer } = req.body;

  if (!interviewId || !userAnswer) {
    return res.status(400).json({ error: 'Interview ID and user answer are required.' });
  }

  try {
    // DB: Get current interview data (resume, JD, transcript)
    const { data: interviewData, error: fetchError } = await supabase
      .from('interviews')
      .select('resume_text, job_description_text, transcript')
      .eq('id', interviewId)
      .single();

    if (fetchError) throw fetchError;
    if (!interviewData) return res.status(404).json({ error: 'Interview session not found.' });

    let currentTranscript = Array.isArray(interviewData.transcript) ? interviewData.transcript : [];
    currentTranscript.push({ sender: 'user', text: userAnswer, timestamp: new Date().toISOString() });

    let nextQuestion = "(Mock AI) That's interesting. Can you give an example?";
    let shouldEndInterview = false;
    let dbStatusUpdate = 'in_progress';
    let feedbackToReturn = null;

    if (!MOCK_AI_CALLS) {
      const conversationHistoryForPrompt = currentTranscript.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.text }));
      
      const messagesForApi = [
        { role: "system", content: "You are an AI interviewer. You have already been provided with the candidate's resume and the job description for the role. Continue the interview based on the conversation history. Focus on asking follow-up questions based on the candidate's answers, relating them back to their experience (from the resume) and the job requirements (from the job description) where appropriate. Do not repeat questions. Evaluate the user's response and compare it with job description and provide feedback on the candidate's suitability for the role. \n\nIMPORTANT: After asking a sufficient number of questions (e.g., 5-7 substantive questions, or if you feel you have a strong assessment), you can choose to conclude the interview. To do this, begin your final response with the exact phrase [END_INTERVIEW] followed by your concluding remarks or a final neutral statement. Do not ask another question if you are ending the interview."},
        ...conversationHistoryForPrompt
      ];

      console.log('--- Sending to OpenRouter in /api/interview/chat ---');
      console.log('Messages for API (last 2 shown if long):', JSON.stringify(messagesForApi.slice(-2), null, 2));

      const completionData = await getOpenRouterCompletion(messagesForApi);
      console.log('--- OpenRouter API Response in /api/interview/chat (completionData) ---');
      console.log(JSON.stringify(completionData, null, 2));

      if (completionData && Array.isArray(completionData.choices) && completionData.choices.length > 0 && completionData.choices[0].message) {
        let rawAiResponse = completionData.choices[0].message.content?.trim();
        console.log(`[DEBUG /chat] Raw AI response from OpenRouter: \"${rawAiResponse}\"`);
        
        let finalUserVisibleMessage = "";

        if (rawAiResponse && rawAiResponse.startsWith('[END_INTERVIEW]')) {
          console.log('[DEBUG /chat] [END_INTERVIEW] tag FOUND.');
          shouldEndInterview = true;
          finalUserVisibleMessage = rawAiResponse.substring('[END_INTERVIEW]'.length).trim();

          if (!finalUserVisibleMessage) {
            finalUserVisibleMessage = "Thank you for the interview. We will get back to you after evaluation.";
            console.log('[DEBUG /chat] AI provided no concluding message after tag, using default.');
          } else {
            console.log('[DEBUG /chat] AI provided concluding message after tag.');
          }
          // Regardless of AI providing a concluding message or not, generate and store feedback now.
          console.log('[DEBUG /chat] Interview ending, generating feedback now.');
          feedbackToReturn = await generateFeedbackText(interviewId, interviewData.resume_text, interviewData.job_description_text, currentTranscript); 
          dbStatusUpdate = 'completed'; // Set status to completed as feedback is being stored
        } else {
          console.log('[DEBUG /chat] [END_INTERVIEW] tag NOT found.');
          finalUserVisibleMessage = rawAiResponse || "Can you elaborate on that?";
          dbStatusUpdate = 'in_progress';
        }
        nextQuestion = finalUserVisibleMessage;
      } else {
        console.error('Error: Invalid or empty completionData.choices from OpenRouter in /chat. Full response:', JSON.stringify(completionData, null, 2));
        nextQuestion = "Can you elaborate on that? (AI question generation failed)"; 
      }
    }

    currentTranscript.push({ sender: 'ai', text: nextQuestion, timestamp: new Date().toISOString() });

    const updatePayload = { transcript: currentTranscript, status: dbStatusUpdate };
    if (feedbackToReturn) { // This will be true if shouldEndInterview was true
      updatePayload.feedback = feedbackToReturn;
      console.log(`[DEBUG /chat] Storing feedback for interview ${interviewId} in DB.`);
    }
    const { error: updateError } = await supabase
      .from('interviews')
      .update(updatePayload)
      .eq('id', interviewId);

    if (updateError) throw updateError;

    console.log(`[DEBUG /chat] Sending response to frontend: nextQuestion: "${nextQuestion.substring(0,50)}...", shouldEndInterview: ${shouldEndInterview}, hasFeedbackField: ${feedbackToReturn !== null}`);
    res.json({ nextQuestion, aniaudiourl: '', shouldEndInterview, feedback: null, interviewId: interviewId });

  } catch (error) {
    console.error('--- Error in /api/interview/chat ---');
    console.error('Error Type:', error.name); 
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Full Error Object (console.dir):');
    console.dir(error, { depth: null });
    
    const errorMessage = error.message || 'An unexpected error occurred in chat progression.';
    // Avoid sending generic {} as details if possible
    const errorDetails = (error.name && error.message) ? { name: error.name, message: error.message } : (typeof error === 'object' && error !== null ? error : null);
    res.status(500).json({ error: 'Failed to process chat message', message: errorMessage, details: errorDetails });
  }
});

// 4. End Interview (Generate and store feedback)
app.post('/api/interview/end', async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Interview ID is required.' });
  }

  try {
    const { data: interviewData, error: fetchError } = await supabase
      .from('interviews')
      .select('resume_text, job_description_text, transcript, status') // fetch status to avoid re-generating if already completed
      .eq('id', interviewId)
      .single();

    if (fetchError) throw fetchError;
    if (!interviewData) return res.status(404).json({ error: 'Interview session not found for feedback generation.' });

    let feedbackText;
    if (interviewData.status === 'completed' && interviewData.feedback) {
        console.log(`[DEBUG /end] Interview ${interviewId} already completed. Returning existing feedback.`);
        feedbackText = interviewData.feedback;
    } else {
        feedbackText = await generateFeedbackText(interviewId, interviewData.resume_text, interviewData.job_description_text, interviewData.transcript);
        // DB: Store feedback
        const { error: updateError } = await supabase
          .from('interviews')
          .update({ feedback: feedbackText, status: 'completed' })
          .eq('id', interviewId);
        if (updateError) throw updateError;
    }

    res.json({ feedback: null, interviewId }); // Send interviewId, feedback is null

  } catch (error) {
    console.error('Error ending interview (full error object):', JSON.stringify(error, null, 2));
    const errorMessage = error.message || 'An unexpected error occurred.';
    const errorDetails = error.details || (typeof error === 'object' && error !== null ? error : null);
    res.status(500).json({ error: 'Failed to end interview', message: errorMessage, details: errorDetails });
  }
});

// --- NEW ENDPOINT TO FETCH FEEDBACK ---
app.get('/api/interview/feedback/:interviewId', async (req, res) => {
  const { interviewId } = req.params;
  if (!interviewId) {
    return res.status(400).json({ error: 'Interview ID is required.' });
  }

  console.log(`[DEBUG /feedback/:id] Attempting to fetch feedback for interview ID: ${interviewId}`);

  try {
    const { data: interviewData, error: fetchError } = await supabase
      .from('interviews')
      .select('feedback, status')
      .eq('id', interviewId)
      .single();

    if (fetchError) {
      console.error(`[DEBUG /feedback/:id] Supabase error fetching interview ${interviewId}:`, fetchError);
      throw fetchError;
    }
    if (!interviewData) {
      console.warn(`[DEBUG /feedback/:id] Interview ${interviewId} not found.`);
      return res.status(404).json({ error: 'Interview session not found.' });
    }

    if ((interviewData.status === 'completed' || interviewData.status === 'pending_feedback') && interviewData.feedback) {
      console.log(`[DEBUG /feedback/:id] Feedback found for interview ${interviewId}.`);
      res.json({ feedback: interviewData.feedback, interviewId });
    } else if (!interviewData.feedback) {
      console.warn(`[DEBUG /feedback/:id] Feedback not yet generated or available for interview ${interviewId} (status: ${interviewData.status}).`);
      return res.status(404).json({ error: 'Feedback not yet available for this interview.', interviewId });
    } else {
      console.warn(`[DEBUG /feedback/:id] Interview ${interviewId} status is ${interviewData.status}, but feedback is unexpectedly missing/null.`);
      return res.status(500).json({ error: 'Feedback missing or interview in unexpected state.', interviewId });
    }

  } catch (error) {
    console.error(`[DEBUG /feedback/:id] Error fetching feedback for interview ${interviewId}:`, JSON.stringify(error, null, 2));
    const errorMessage = error.message || 'An unexpected error occurred.';
    res.status(500).json({ error: 'Failed to fetch feedback', message: errorMessage });
  }
});
// --- END NEW FEEDBACK ENDPOINT ---

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  if (MOCK_AI_CALLS) {
    console.log('*********************************************************************************');
    console.log('** WARNING: AI CALLS ARE CURRENTLY MOCKED. USING PLACEHOLDER RESPONSES.        **');
    console.log('** TO ENABLE REAL AI, SET MOCK_AI_CALLS = false AND CONFIGURE OPENROUTER_API_KEY **');
    console.log('*********************************************************************************');
  }
});

// TODO:
// - Implement actual LLM calls (OpenAI, Claude, etc.)
// - Implement database interactions (Supabase)
// - Error handling
// - Input validation
// - Potentially extract text from PDF/DOCX resumes on the backend 

async function getOpenRouterCompletion(promptMessages, model = OPENROUTER_DEFAULT_MODEL, max_tokens = 100) {
  if (MOCK_AI_CALLS) {
    throw new Error('getOpenRouterCompletion called while MOCK_AI_CALLS is true. This should not happen.');
  }
  if (!openRouterApiKey) { // Added check here for robustness, though process should exit earlier if missing
    console.error('CRITICAL: openRouterApiKey is not defined in getOpenRouterCompletion!');
    throw new Error('OpenRouter API key is not configured.');
  }
  try {
    const response = await axios.post(
      OPENROUTER_API_ENDPOINT,
      {
        model: model,
        messages: promptMessages,
        max_tokens: max_tokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          // Optional: 'HTTP-Referer': 'YOUR_SITE_URL', // Set if OpenRouter requires it for your account
          // Optional: 'X-Title': 'YOUR_APP_NAME', // Set if OpenRouter requires it
        },
      }
    );
    console.log('--- Raw response.data from OpenRouter API call in getOpenRouterCompletion ---');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error calling OpenRouter (within getOpenRouterCompletion catch block):', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    // It's important that if the API call itself fails (network, auth), we don't return undefined implicitly.
    // Throwing an error is correct, which will be caught by the route handler.
    // However, if OpenRouter returns 200 OK with an error JSON, that will pass through here.
    // The log above will show that structure.
    throw new Error(`OpenRouter API call failed: ${error.message}`);
  }
}

// --- NEW HELPER FUNCTION FOR SUMMARIZATION ---
async function getSummarizedText(textToSummarize, purposeDescription, targetTokenCount = 1000) {
  if (!textToSummarize || typeof textToSummarize !== 'string' || textToSummarize.trim() === '') {
    return ''; // Return empty if no text
  }
  // Simple check: if text is already reasonably short, maybe don't summarize (e.g. < 1.5 * targetTokenCount in characters)
  // This is a rough heuristic. A proper token counter would be better but adds complexity.
  // Assuming 1 token ~ 4 chars for a rough estimate.
  if (textToSummarize.length < targetTokenCount * 4 * 1.5) {
    // console.log(`Text for ${purposeDescription} is short enough, not summarizing.`);
    return textToSummarize;
  }

  console.log(`Attempting to summarize text for: ${purposeDescription}`);
  const summarizationPrompt = `Please summarize the following text. The summary will be used for ${purposeDescription}. Condense it significantly while retaining all key information, names, skills, and dates relevant to that purpose. Aim for a summary that is around ${targetTokenCount} tokens or less if possible, but prioritize completeness of key information over strict token count if necessary.\n\nText to summarize:\n---\n${textToSummarize}\n---\nSummary:`;

  try {
    if (MOCK_AI_CALLS) {
      console.warn('WARN: MOCK_AI_CALLS is true for summarization. Returning truncated original text as mock summary.');
      return `(Mock Summary for ${purposeDescription}) ` + textToSummarize.substring(0, targetTokenCount * 2);
    }

    const completionData = await getOpenRouterCompletion(
      [{ role: "user", content: summarizationPrompt }],
      OPENROUTER_DEFAULT_MODEL, // Or a model good at summarization
      targetTokenCount + 200 // Allow some buffer for the summary generation
    );

    if (completionData && Array.isArray(completionData.choices) && completionData.choices.length > 0 && completionData.choices[0].message) {
      const summary = completionData.choices[0].message.content?.trim();
      console.log(`Successfully summarized text for: ${purposeDescription}. Original length: ${textToSummarize.length}, Summary length: ${summary?.length}`);
      return summary || ''; // Ensure empty string if summary is null/undefined
    } else {
      console.error(`Error: Failed to get a valid summary for ${purposeDescription}. OpenRouter response:`, JSON.stringify(completionData, null, 2));
      return textToSummarize.substring(0, targetTokenCount * 3); // Fallback to truncated original
    }
  } catch (error) {
    console.error(`Error during summarization call for ${purposeDescription}:`, error.message);
    // Fallback to a truncated version of the original text in case of error
    return textToSummarize.substring(0, targetTokenCount * 3);
  }
}
// --- END NEW HELPER FUNCTION ---
