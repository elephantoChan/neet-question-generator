import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

// A complete and self-contained React component for the NEET Quiz Generator.
// This version handles multiple image uploads and allows exporting the questions.
const App = () => {
  const { register, handleSubmit } = useForm();
  
  // State variables to manage the application's flow and data.
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Constants for API calls and UI elements.
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=';
  const API_KEY = ''; // This will be automatically populated by the Canvas environment.

  /**
   * Encodes a file as a base64 data URL.
   * This is necessary to send image data to the Gemini API.
   * @param {File} file The image file to encode.
   * @returns {Promise<string | ArrayBuffer>} A promise that resolves with the base64 string.
   */
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  /**
   * Handles the form submission to generate the quiz.
   * It now handles an array of image files and constructs the API payload accordingly.
   */
  const onSubmit = async (data) => {
    setLoading(true);
    setQuestions(null);
    setResults(null);
    setError(null);
    setAnswers({});

    try {
      const imageFiles = data.images;

      if (imageFiles.length === 0) {
        throw new Error("Please upload at least one image.");
      }

      // Construct the parts of the prompt, including the introductory text.
      const parts = [
        {
          text: `
          From the following images, generate 10-20 NEET-level multiple-choice questions.
          For each question, provide 4 options (A, B, C, D) and a single correct answer.
          Also, provide a detailed solution/explanation for the correct answer.
          
          The questions must strictly adhere to the NEET syllabus (Physics, Chemistry, Biology).
          The questions should be challenging and cover key concepts from the images.
          
          The response must be in a specific JSON format to be parsed correctly.
          Do not include any other text or markdown outside of the JSON.
          `
        }
      ];

      // Process each image file and add its base64 data to the parts array.
      for (const file of imageFiles) {
        const base64Data = await fileToBase64(file);
        parts.push({
          inlineData: {
            mimeType: file.type,
            data: base64Data,
          },
        });
      }

      // Define the expected JSON structure for the API response.
      const responseSchema = {
        type: 'OBJECT',
        properties: {
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                questionText: { type: 'STRING' },
                options: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
                correctAnswer: { type: 'STRING' },
                solution: { type: 'STRING' },
              },
            },
          },
        },
      };

      // Construct the full API payload.
      const payload = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      };

      // Make the API call with exponential backoff for robustness.
      let response = null;
      let retries = 0;
      const MAX_RETRIES = 5;
      while (retries < MAX_RETRIES) {
        try {
          response = await fetch(API_URL + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.ok) break; // Exit loop on success
        } catch (e) {
          // Log a silent retry
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100)); // Exponential backoff
      }

      if (!response || !response.ok) {
        throw new Error('API call failed after multiple retries.');
      }

      const result = await response.json();
      const jsonString = result.candidates[0].content.parts[0].text;
      const parsedData = JSON.parse(jsonString);

      // Set the questions and reset for a new quiz round.
      setQuestions(parsedData.questions);
      setLoading(false);

    } catch (e) {
      console.error('Error generating questions:', e);
      setError('Failed to generate questions. Please try again with different content.');
      setLoading(false);
    }
  };

  /**
   * Handles the user's selection of an answer for a specific question.
   * @param {number} questionIndex The index of the question.
   * @param {string} selectedOption The selected option (e.g., 'A', 'B', 'C', 'D').
   */
  const handleAnswerSelect = (questionIndex, selectedOption) => {
    setAnswers((prevAnswers) => ({
      ...prevAnswers,
      [questionIndex]: selectedOption,
    }));
  };

  /**
   * Calculates the user's score and accuracy after they submit the quiz.
   * It compares the user's answers with the correct answers from the questions data.
   */
  const calculateResults = () => {
    let correctCount = 0;
    questions.forEach((question, index) => {
      if (answers[index] === question.correctAnswer) {
        correctCount++;
      }
    });
    const totalQuestions = questions.length;
    const score = correctCount;
    const accuracy = (correctCount / totalQuestions) * 100;

    setResults({ score, accuracy, totalQuestions });
  };
  
  /**
   * Exports the questions, answers, and solutions to a .txt file.
   * The format is "question:answer:solution:explanation".
   */
  const handleExport = () => {
    if (!questions) return;
    
    // Create the content string in the specified format.
    const exportContent = questions.map(q => 
      `${q.questionText}:${q.correctAnswer}:${q.solution}`
    ).join('\n\n'); // Use double newline to separate questions for readability
    
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'neet_questions_and_solutions.txt');
    
    // Append the link to the body, click it, and then remove it.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Renders the main application UI.
   * It conditionally renders the form, a loading spinner, the quiz, or the results screen.
   */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-10 w-full max-w-4xl border border-gray-200">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 text-center mb-2">NEET Quiz Generator</h1>
        <p className="text-center text-gray-600 mb-8 text-lg sm:text-xl">
          Generate a practice quiz from your images.
        </p>
        
        {/* Form for content input */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
            <label className="block w-full sm:w-1/2">
              <span className="text-gray-700 text-sm font-medium mb-1 block">Upload one or more images</span>
              <input
                {...register('images')}
                type="file"
                multiple
                accept="image/*"
                className="w-full text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors duration-300 cursor-pointer"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Generate Questions'}
            </button>
          </div>
        </form>

        {/* Loading spinner */}
        {loading && (
          <div className="flex justify-center items-center my-10">
            <div className="w-12 h-12 border-4 border-blue-400 border-dashed rounded-full animate-spin"></div>
            <p className="ml-4 text-gray-600 text-lg">Generating NEET-level questions...</p>
          </div>
        )}

        {/* Error message display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mt-6">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {/* Questions and quiz interface */}
        {questions && !results && (
          <div className="mt-8 space-y-8">
            {questions.map((q, qIndex) => (
              <div key={qIndex} className="bg-gray-50 p-6 rounded-2xl shadow-inner">
                <p className="text-lg font-semibold text-gray-800 mb-4">
                  <span className="text-blue-600 mr-2">{qIndex + 1}.</span> {q.questionText}
                </p>
                <ul className="space-y-3">
                  {q.options.map((option, optIndex) => (
                    <li key={optIndex} className="flex items-center">
                      <input
                        type="radio"
                        id={`q${qIndex}-opt${optIndex}`}
                        name={`question-${qIndex}`}
                        value={String.fromCharCode(65 + optIndex)}
                        onChange={(e) => handleAnswerSelect(qIndex, e.target.value)}
                        className="form-radio h-5 w-5 text-blue-600 rounded-full cursor-pointer"
                      />
                      <label htmlFor={`q${qIndex}-opt${optIndex}`} className="ml-3 text-gray-700 cursor-pointer text-base">
                        {String.fromCharCode(65 + optIndex)}. {option}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex justify-center mt-8">
              <button
                onClick={calculateResults}
                className="px-8 py-4 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition-all duration-300 transform hover:scale-105"
              >
                Submit Quiz
              </button>
            </div>
          </div>
        )}

        {/* Results section */}
        {results && (
          <div className="mt-8 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-blue-600 mb-2">Quiz Results</h2>
              <p className="text-xl text-gray-800">
                You scored <span className="font-bold">{results.score}</span> out of <span className="font-bold">{results.totalQuestions}</span>.
              </p>
              <p className="text-xl text-gray-800">
                Your accuracy is <span className="font-bold text-green-600">{results.accuracy.toFixed(2)}%</span>.
              </p>
            </div>
            
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-gray-800 border-b-2 border-gray-200 pb-2">Solutions</h3>
              {questions.map((q, qIndex) => (
                <div key={qIndex} className="bg-gray-50 p-6 rounded-2xl shadow-inner border border-gray-200">
                  <p className="text-lg font-semibold text-gray-800 mb-2">
                    <span className="text-blue-600 mr-2">{qIndex + 1}.</span> {q.questionText}
                  </p>
                  <p className="text-gray-700 font-medium">
                    Your Answer: <span className={answers[qIndex] === q.correctAnswer ? "text-green-600" : "text-red-600"}>{answers[qIndex] || 'Not answered'}</span>
                  </p>
                  <p className="text-gray-700 font-medium">
                    Correct Answer: <span className="text-green-600">{q.correctAnswer}</span>
                  </p>
                  <div className="mt-4 text-sm text-gray-600">
                    <h4 className="font-bold text-gray-800 mb-1">Solution:</h4>
                    <p>{q.solution}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center mt-8">
              <button
                onClick={handleExport}
                className="px-8 py-4 bg-gray-800 text-white font-bold rounded-xl shadow-md hover:bg-gray-900 transition-all duration-300 transform hover:scale-105"
              >
                Export Questions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
