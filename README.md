# ai-interview-chatbot
An AI interviewer that conducts interviews based on a user's resume, responses and job description, then generates feedback on their performance.

## Features

*   Upload Resume and Job Description (PDF, DOC, DOCX, TXT).
*   Interactive chat-based interview with an AI.
*   AI adapts questions based on user responses, resume, and JD.
*   Text-to-Speech for AI questions (toggleable).
*   Speech-to-Text for user answers.
*   AI automatically ends the interview after sufficient questions.
*   Admin-gated feedback view via a modal (password: "admin").
*   Feedback generation considers resume, JD, and interview transcript.

## Project Structure

```
ai-interview-chatbot/
├── backend/         # Node.js, Express server
│   ├── .env         # Local environment variables (ignored by git)
│   ├── .env.example # Example environment variables
│   ├── node_modules/
│   ├── package.json
│   ├── package-lock.json
│   └── index.js     # Main backend server file
├── frontend/        # React (Vite) application
│   ├── node_modules/
│   ├── public/
│   ├── src/
│   │   ├── App.css
│   │   ├── App.jsx    # Main frontend component
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
└── README.md
```

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18.x or later recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)
*   A [Supabase](https://supabase.com/) account (for database storage).
*   An [OpenRouter.ai](https://openrouter.ai/) account (for LLM access) or another AI provider if you modify the API calls.

## Setup and Running the Application

### 1. Backend Setup

   a. **Navigate to the backend directory:**
      ```bash
      cd backend
      ```

   b. **Create `.env` file:**
      Copy the `backend/.env.example` file to a new file named `backend/.env`.
      ```bash
      cp .env.example .env
      ```
      *Note: If you didn't create `.env.example` as instructed earlier, please create it manually in the `backend` directory with the following content before copying:*
      ```
      SUPABASE_URL=YOUR_SUPABASE_URL_HERE
      SUPABASE_KEY=YOUR_SUPABASE_ANON_OR_SERVICE_KEY_HERE
      OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY_HERE
      PORT=3001
      ```

   c. **Configure Environment Variables:**
      Open `backend/.env` and fill in your actual credentials:
      *   `SUPABASE_URL`: Your Supabase project URL.
      *   `SUPABASE_KEY`: Your Supabase project anon key (or service_role key if your RLS policies require it for server-side operations - anon key is generally fine for this project setup).
      *   `OPENROUTER_API_KEY`: Your API key from OpenRouter.ai.
      *   `PORT`: (Optional) The port for the backend server (defaults to 3001 if not set or if the fallback in `index.js` is used).

   d. **Install Dependencies:**
      ```bash
      npm install
      ```

   e. **Run the Backend Server:**
      ```bash
      npm start
      ```
      The backend server should start, typically on `http://localhost:3001` (or the port you configured).

### 2. Frontend Setup

   a. **Navigate to the frontend directory (from the project root):**
      ```bash
      cd ../frontend 
      # Or from backend: cd ../frontend
      # Or from project root: cd frontend
      ```

   b. **Install Dependencies:**
      ```bash
      npm install
      ```

   c. **Run the Frontend Development Server:**
      ```bash
      npm run dev
      ```
      The frontend development server will start, usually on `http://localhost:5173` (Vite's default) or another available port. Your browser might open automatically, or you can open the provided URL.

### 3. Using the Application

   a. Open the frontend URL (e.g., `http://localhost:5173`) in your web browser.
   b. Upload your resume file (PDF, DOC, DOCX, TXT).
   c. Upload the job description file (PDF, DOC, DOCX, TXT).
   d. Click "Start Interview".
   e. Interact with the AI interviewer using text input or the voice recording feature.
   f. The AI will ask questions. Once it determines the interview is complete, it will display a concluding message (e.g., "Thank you for the interview. We will get back to you after evaluation.").
   g. At this point, inputs will be disabled, and two buttons will appear:
      *   "View Feedback (Admin)"
      *   "Start New Interview"

### 4. Checking Feedback in Supabase Database (Admin/Developer)

   After an interview is completed (either by the AI auto-ending or by manually clicking "End Interview" in a previous version of the flow), the AI-generated feedback is stored in your Supabase database.

   a. **Log in to your Supabase account:** [app.supabase.com](https://app.supabase.com)
   b. **Select your Project.**
   c. In the left sidebar, navigate to the **Table Editor** (it looks like a grid icon).
   d. **Select the `interviews` table** from the list of tables in your `public` schema (or whichever schema you used if customized).
   e. **Locate the Interview Record:** Find the row corresponding to the interview you conducted. You can identify it by `id` or `created_at` timestamp.
   f. **Check Feedback:** Look for the `feedback` column in that row. It should contain the detailed feedback text generated by the AI.
   g. **Check Status:** The `status` column should be `completed` if the feedback has been generated and stored successfully.

   *Note: The "View Feedback (Admin)" button in the UI provides a way to view this feedback through the application itself after entering the admin password ("admin"). Checking directly in the database is an alternative for developers/admins.* 

## Key Technologies

*   **Frontend:** React, Vite, Axios, Web Speech API (SpeechSynthesis & SpeechRecognition)
*   **Backend:** Node.js, Express, Multer (for file uploads), Textract (for text extraction), Axios (for OpenRouter API), Supabase Client Library
*   **AI:** OpenRouter.ai (or any compatible LLM provider)
*   **Database:** Supabase (PostgreSQL)

## Future Enhancements (Ideas)

*   More sophisticated AI question generation and adaptability.
*   User accounts and interview history.
*   Different interview types/modes.
*   Customizable AI interviewer personas.
*   More detailed feedback analytics.
