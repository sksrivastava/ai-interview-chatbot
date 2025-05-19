import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css'; // We'll create this later for styling

const API_BASE_URL = 'http://localhost:3001/api'; // Assuming backend runs on port 3001

function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [interviewId, setInterviewId] = useState(null);

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      if (fileType === 'resume') {
        setResumeFile(file);
      } else if (fileType === 'jobDescription') {
        setJobDescriptionFile(file);
      }
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
      // Step 1: Upload files and get extracted text from backend
      // Only call /upload if there are files (which there will be due to the check above)
      const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      uploadedResumeText = uploadResponse.data.resumeText || '';
      uploadedJobDescriptionText = uploadResponse.data.jobDescriptionText || '';
      
      if (!uploadedResumeText) {
        alert('Failed to extract text from resume. Please check the file or try a different one.');
        setIsLoading(false);
        return;
      }
      if (!uploadedJobDescriptionText) { // Check if JD text was successfully extracted
        alert('Failed to extract text from job description file. Please check the file or try a different one.');
        setIsLoading(false);
        return;
      }

      // Step 2: Start the interview with the extracted texts
      const response = await axios.post(`${API_BASE_URL}/interview/start`, {
        resumeText: uploadedResumeText,
        jobDescriptionText: uploadedJobDescriptionText // Use text from uploaded JD file
      });

      setInterviewId(response.data.interviewId);
      setResumeFile(null);
      setJobDescriptionFile(null);
    } catch (error) {
      console.error('Error starting interview:', error);
      alert('An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
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
    </div>
  );
}

export default App; 