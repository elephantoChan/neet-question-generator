import React, { useState } from "react";
import { useForm } from "react-hook-form";

// A complete and self-contained React component for the NEET Quiz Generator.
// This version supports multiple file uploads (any type), allows specifying the number of questions,
// features a dark mode Catppuccin Mocha theme, and enables exporting questions.
const App = () => {
	const { register, handleSubmit } = useForm();

	// State variables to manage the application's flow and data.
	const [loading, setLoading] = useState(false);
	const [questions, setQuestions] = useState(null);
	const [answers, setAnswers] = useState({});
	const [results, setResults] = useState(null);
	const [error, setError] = useState(null);

	// Constants for API calls and UI elements.
	const API_URL =
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
	const API_KEY = "AIzaSyB2Krz58BA5eFPiXQQVi4uYO1Cn6AN2B3Q"; // This will be automatically populated by the Canvas environment.

	/**
	 * Encodes a file as a base64 data URL.
	 * This is necessary to send file data to the Gemini API.
	 * @param {File} file The file to encode.
	 * @returns {Promise<string | ArrayBuffer>} A promise that resolves with the base64 string.
	 */
	const fileToBase64 = (file) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result.split(",")[1]);
			reader.onerror = (error) => reject(error);
			reader.readAsDataURL(file);
		});
	};

	/**
	 * Handles the form submission to generate the quiz.
	 * It processes multiple file inputs, constructs the API payload,
	 * calls the Gemini API, and updates the state with the generated questions.
	 */
	const onSubmit = async (data) => {
		setLoading(true);
		setQuestions(null);
		setResults(null);
		setError(null);
		setAnswers({});

		try {
			const files = data.files;
			const numQuestions = data.numQuestions || 10; // Default to 10 if not specified

			if (files.length === 0) {
				throw new Error("Please upload at least one file.");
			}

			// Construct the parts of the prompt, including the introductory text and question count.
			const parts = [
				{
					text: `
          From the following files, generate ${numQuestions} NEET-level multiple-choice questions.
          For each question, provide 4 options (A, B, C, D) and a single correct answer.
          Make sure there is exactly the amount of questions as specified above.
          Also, provide a detailed solution/explanation for the correct answer.

          The questions must strictly adhere to the NEET syllabus (Physics, Chemistry, Biology).
          The questions should be challenging and cover key concepts from the provided content.

          The response must be in a specific JSON format to be parsed correctly.
          Do not include any other text or markdown outside of the JSON.
          `,
				},
			];

			// Process each file and add its base64 data to the parts array.
			// The mimeType is dynamically set from the file itself.
			for (const file of files) {
				const base64Data = await fileToBase64(file);
				parts.push({
					inlineData: {
						mimeType: file.type, // Use the actual MIME type of the uploaded file
						data: base64Data,
					},
				});
			}

			// Define the expected JSON structure for the API response.
			const responseSchema = {
				type: "OBJECT",
				properties: {
					questions: {
						type: "ARRAY",
						items: {
							type: "OBJECT",
							properties: {
								questionText: { type: "STRING" },
								options: {
									type: "ARRAY",
									items: { type: "STRING" },
								},
								correctAnswer: { type: "STRING" },
								solution: { type: "STRING" },
							},
						},
					},
				},
			};

			// Construct the full API payload.
			const payload = {
				contents: [{ role: "user", parts }],
				generationConfig: {
					responseMimeType: "application/json",
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
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					if (response.ok) break; // Exit loop on success
				} catch (e) {
					// Log a silent retry
				}
				retries++;
				await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 100)); // Exponential backoff
			}

			if (!response || !response.ok) {
				throw new Error("API call failed after multiple retries.");
			}

			const result = await response.json();
			const jsonString = result.candidates[0].content.parts[0].text;
			const parsedData = JSON.parse(jsonString);

			// Set the questions and reset for a new quiz round.
			setQuestions(parsedData.questions);
			setLoading(false);
		} catch (e) {
			console.error("Error generating questions:", e);
			setError("Failed to generate questions. Please try again. Ensure files contain relevant text/images.");
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
	 * Exports the questions, answers, and solutions to a .txt or .csv file.
	 * The format is "question:answer:solution:explanation".
	 * @param {string} format 'txt' or 'csv'
	 */
	const handleExport = (format) => {
		if (!questions) return;

		let exportContent = "";
		let filename = "";
		let mimeType = "";

		if (format === "csv") {
			// CSV header
			exportContent += '"Question","Correct Answer","Solution"\n';
			questions.forEach((q) => {
				// Enclose fields in double quotes and escape internal double quotes
				const questionText = `"${q.questionText.replace(/"/g, '""')}"`;
				const correctAnswer = `"${q.correctAnswer.replace(/"/g, '""')}"`;
				const solution = `"${q.solution.replace(/"/g, '""')}"`;
				exportContent += `${questionText},${correctAnswer},${solution}\n`;
			});
			filename = "neet_questions_and_solutions.csv";
			mimeType = "text/csv;charset=utf-8;";
		} else {
			// Default to TXT
			questions.forEach((q, index) => {
				exportContent += `Question ${index + 1}: ${q.questionText}\n`;
				q.options.forEach((opt, optIndex) => {
					exportContent += `  ${String.fromCharCode(65 + optIndex)}. ${opt}\n`;
				});
				exportContent += `Correct Answer: ${q.correctAnswer}\n`;
				exportContent += `Solution: ${q.solution}\n\n`;
			});
			filename = "neet_questions_and_solutions.txt";
			mimeType = "text/plain;charset=utf-8";
		}

		const blob = new Blob([exportContent], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.setAttribute("download", filename);

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
		<div className="min-h-screen font-sans bg-[#1E1E2E] text-[#CDD6F4] flex items-center justify-center p-4 sm:p-6 lg:p-8">
			<div className="bg-[#313244] rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-10 w-full max-w-4xl border border-[#45475A]">
				<h1 className="text-3xl sm:text-4xl font-extrabold text-[#89B4FA] text-center mb-2">NEET Quiz Generator</h1>
				<p className="text-center text-[#A6ADC8] mb-8 text-lg sm:text-xl">
					Generate a practice quiz from your documents and files.
				</p>

				{/* Form for content input */}
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<label className="block">
							<span className="text-[#CDD6F4] text-sm font-medium mb-1 block">Number of Question</span>
							<input
								{...register("numQuestions")}
								type="number"
								min="1"
								defaultValue="10"
								className="w-full p-3 border border-[#45475A] rounded-xl bg-[#181825] text-[#CDD6F4] focus:ring-[#89B4FA] focus:border-[#89B4FA] transition-all duration-300 shadow-sm"
							/>
						</label>
						<label className="block">
							<span className="text-[#CDD6F4] text-sm font-medium mb-1 block">Upload files</span>
							<input
								{...register("files")}
								type="file"
								multiple
								// Removed accept attribute to allow any file type as requested
								className="w-full text-[#CDD6F4] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#89B4FA]/20 file:text-[#89B4FA] hover:file:bg-[#89B4FA]/30 transition-colors duration-300 cursor-pointer"
							/>
						</label>
					</div>

					<div className="flex justify-center mt-6">
						<button
							type="submit"
							disabled={loading}
							className="px-10 py-3 bg-[#89B4FA] text-[#1E1E2E] font-bold rounded-xl shadow-md hover:bg-[#74A3E0] transition-all duration-300 transform hover:scale-105 disabled:bg-[#6C7086] disabled:text-[#45475A] disabled:cursor-not-allowed"
						>
							{loading ? "Generating..." : "Generate Questions"}
						</button>
					</div>
				</form>

				{/* Loading spinner */}
				{loading && (
					<div className="flex justify-center items-center my-10">
						<div className="w-12 h-12 border-4 border-[#89B4FA] border-dashed rounded-full animate-spin"></div>
						<p className="ml-4 text-[#A6ADC8] text-lg">Generating NEET-level questions...</p>
					</div>
				)}

				{/* Error message display */}
				{error && (
					<div className="bg-[#F38BA8]/20 border border-[#F38BA8]/40 text-[#F38BA8] p-4 rounded-xl mt-6">
						<p className="font-semibold">Error:</p>
						<p>{error}</p>
					</div>
				)}

				{/* Questions and quiz interface */}
				{questions && !results && (
					<div className="mt-8 space-y-8">
						{questions.map((q, qIndex) => (
							<div key={qIndex} className="bg-[#181825] p-6 rounded-2xl shadow-inner border border-[#45475A]">
								<p className="text-lg font-semibold text-[#CDD6F4] mb-4">
									<span className="text-[#89B4FA] mr-2">{qIndex + 1}.</span> {q.questionText}
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
												className="form-radio h-5 w-5 text-[#89B4FA] rounded-full cursor-pointer bg-[#1E1E2E] border-[#45475A] checked:bg-[#89B4FA]"
											/>
											<label
												htmlFor={`q${qIndex}-opt${optIndex}`}
												className="ml-3 text-[#CDD6F4] cursor-pointer text-base"
											>
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
								className="px-8 py-4 bg-[#A6E3AD] text-[#1E1E2E] font-bold rounded-xl shadow-md hover:bg-[#92CC99] transition-all duration-300 transform hover:scale-105"
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
							<h2 className="text-3xl font-extrabold text-[#89B4FA] mb-2">Quiz Results</h2>
							<p className="text-xl text-[#CDD6F4]">
								You scored <span className="font-bold">{results.score}</span> out of{" "}
								<span className="font-bold">{results.totalQuestions}</span>.
							</p>
							<p className="text-xl text-[#CDD6F4]">
								Your accuracy is{" "}
								<span className="font-bold text-[#A6E3AD]">{results.accuracy.toFixed(2)}%</span>.
							</p>
						</div>

						<div className="space-y-6">
							<h3 className="text-2xl font-bold text-[#CDD6F4] border-b-2 border-[#45475A] pb-2">Solutions</h3>
							{questions.map((q, qIndex) => (
								<div key={qIndex} className="bg-[#181825] p-6 rounded-2xl shadow-inner border border-[#45475A]">
									<p className="text-lg font-semibold text-[#CDD6F4] mb-2">
										<span className="text-[#89B4FA] mr-2">{qIndex + 1}.</span> {q.questionText}
									</p>
									<p className="text-[#CDD6F4] font-medium">
										Your Answer:{" "}
										<span
											className={
												answers[qIndex] === q.correctAnswer ? "text-[#A6E3AD]" : "text-[#F38BA8]"
											}
										>
											{answers[qIndex] || "Not answered"}
										</span>
									</p>
									<p className="text-[#CDD6F4] font-medium">
										Correct Answer: <span className="text-[#A6E3AD]">{q.correctAnswer}</span>
									</p>
									<div className="mt-4 text-sm text-[#BAC2DE]">
										<h4 className="font-bold text-[#CDD6F4] mb-1">Solution:</h4>
										<p>{q.solution}</p>
									</div>
								</div>
							))}
						</div>
						<div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
							<button
								onClick={() => handleExport("txt")}
								className="px-8 py-4 bg-[#585B70] text-[#CDD6F4] font-bold rounded-xl shadow-md hover:bg-[#45475A] transition-all duration-300 transform hover:scale-105"
							>
								Export Questions as TXT
							</button>
							<button
								onClick={() => handleExport("csv")}
								className="px-8 py-4 bg-[#585B70] text-[#CDD6F4] font-bold rounded-xl shadow-md hover:bg-[#45475A] transition-all duration-300 transform hover:scale-105"
							>
								Export Questions as CSV
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default App;
