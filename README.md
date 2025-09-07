<div align="center">
  <h1 align="center">✨ Project Hypatia</h1>
  <p align="center">
    An AI-Powered Scientific Discovery Platform, right in your browser.
    <br />
    <a href="#about-the-project"><strong>Explore the features »</strong></a>
    <br />
    <br />
  </p>
    <p align="center">
    <img src="https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white" alt="React">
    <img src="https://img.shields.io/badge/Bootstrap-5.3-purple?logo=bootstrap&logoColor=white" alt="Bootstrap">
    <img src="https://img.shields.io/badge/Gemini_API-v2.5-4285F4?logo=google&logoColor=white" alt="Gemini API">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
  </p>
</div>

---

### **Note: This is a sophisticated frontend-only application that runs entirely in your browser. All data is securely stored on your local machine using IndexedDB. No backend or sign-up is required.**

---

Project Hypatia is your digital lab partner, an AI-powered platform designed to assist researchers, students, and citizen scientists throughout the entire scientific discovery process. It provides a structured, 10-step workflow, leveraging the Google Gemini API to streamline every stage of research, from question formulation to a publication-ready draft.

<br>

## Table of Contents

- [About The Project](#about-the-project)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
  - [The 10-Step Workflow](#1-the-10-step-workflow)
  - [Fine-Tuning the AI](#2-fine-tuning-the-ai)
  - [The Experiment Runner (Step 6)](#3-the-experiment-runner-step-6)
- [Contributing](#contributing)
- [License](#license)

---

## About The Project

Project Hypatia empowers researchers by providing an intuitive, AI-driven platform that accelerates discovery, fosters innovation, and enhances the quality of research. It acts as a comprehensive digital lab notebook, guiding users from an initial spark of an idea to a fully-formed publication draft, all within a single, cohesive interface. The goal is to democratize the research process, offering a structured yet flexible environment for scientific exploration.

<br>

## Key Features

-   ✅ **Local-First Storage**: All experiment data is stored directly in your browser's **IndexedDB via Dexie.js**—no backend, no sign-ups, no data leaves your machine.
-   🗂️ **Experiment Dashboard**: A central hub to create, view, and manage all your research projects.
-   🗺️ **Guided 10-Step Workflow**: A structured path from idea to publication, with each step contextually building upon the previous ones.
-   ⚙️ **Fine-Tune AI Parameters**: On a per-step basis, adjust AI settings like a peer reviewer's persona, the level of detail in a methodology, or the novelty of a hypothesis.
-   ✏️ **Editable Outputs**: All AI-generated text can be edited and saved, giving you full control over the research narrative.
-   🔬 **Interactive Experimentation (Step 6)**: A versatile experimental hub with three modes:
    -   **Custom Code Simulation**: A sandboxed JavaScript environment with a `hypatia.finish()` hook.
    -   **Direct Data Upload**: For offline experiments, with AI-powered template generation.
    -   **AI-Powered Data Synthesis**: For conceptual testing without needing to code or collect data.
-   🧠 **Advanced AI Integration**:
    -   **Google Search Grounding**: The Literature Review step provides up-to-date, cited sources.
    -   **JSON Mode & Live Charts**: The Data Analyzer uses a strict JSON schema and Chart.js to create live data visualizations.
    -   **Streaming Responses**: AI text streams in token-by-token for a responsive and engaging UI.
-   📚 **In-App Documentation**: The help manual you're reading right now is accessible from any screen in the app.

<br>

## Technology Stack

This project is built with modern, accessible web technologies.

-   **Frontend**: [React](https://react.dev/) (v19), HTML5, CSS3
-   **Styling**: [Bootstrap 5.3](https://getbootstrap.com/) & [Bootstrap Icons](https://icons.getbootstrap.com/)
-   **AI**: [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash`)
-   **Charts**: [Chart.js](https://www.chartjs.org/)
-   **Client-Side Storage**: [Dexie.js](https://dexie.org/) (IndexedDB Wrapper)
-   **Markdown Rendering**: `marked` library

<br>

## Getting Started

To get a local copy up and running, simply follow these steps.

1.  Download the repository files (`index.html`, `index.tsx`, `README.md`, etc.).
2.  Open the `index.html` file in a modern web browser (like Chrome, Firefox, or Edge).
3.  That's it! The application will load and be ready to use.

<br>

## Usage Guide

### 1. The 10-Step Workflow

When you open the app, you start on the landing page and can navigate to the **Dashboard**. From there, you can create a new experiment or select an existing one. This will take you to the main workspace, which guides you through the scientific method. The AI's output at each step informs the next, creating a cohesive research narrative.

| Step | Title                   | Description                                                                                                                                                             |
| :--- | :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Research Question       | Refine a broad idea into a focused, testable scientific question.                                                                                                       |
| 2    | Literature Review       | Uses Google Search grounding to survey recent, relevant academic papers, identifying key findings and research gaps.                                                      |
| 3    | Hypothesis Formulation  | Generate multiple, distinct, and testable hypotheses based on the literature review.                                                                                    |
| 4    | Methodology Design      | Design a detailed, step-by-step experimental protocol appropriate for the chosen field of study.                                                                        |
| 5    | Data Collection Plan    | Outline the specific variables to be measured, the format for data recording, and quality control procedures.                                                             |
| 6    | **Experiment Runner**   | The core experimental step. Choose to run a custom JavaScript simulation, upload your own dataset, or have the AI synthesize a plausible one.                               |
| 7    | Data Analyzer           | Ingests data from Step 6 and performs statistical analysis, generating a narrative summary and a live data visualization (using Chart.js) via a structured JSON output.     |
| 8    | Conclusion Drawing      | Interpret the analysis results to determine if the hypothesis was supported, discussing implications, limitations, and future work.                                       |
| 9    | Peer Review Simulation  | Submits the entire project to a simulated AI peer reviewer (with adjustable personas like 'Harsh Critic') for constructive feedback.                                        |
| 10   | Publication Exporter    | Assembles the entire research journey into a formatted, publication-ready draft paper, including Abstract, Introduction, Methods, etc.                                      |

**Full Control**: You have full control over the AI's output.
-   On any step where text has been generated, you will see an **<i class="bi bi-pencil-square"></i> Edit** button.
-   Clicking it turns the text into an editable field. Make your changes and click the **<i class="bi bi-check-lg"></i> Save** button.
-   Your saved version becomes the new "official" output for that step and will be used to provide context for all future AI generations.

### 2. Fine-Tuning the AI

In each step of the workspace, you can click the **<i class="bi bi-sliders"></i> Fine-Tune AI** button. This opens a modal with parameters specific to that step, allowing you to guide the AI's behavior more precisely. For example, you can change the persona of the peer reviewer in Step 9, demand a more detailed methodology in Step 4, or ask for more novel hypotheses in Step 3.

### 3. The Experiment Runner (Step 6)

This step offers three powerful paths forward, accessible via tabs:

**A) Run Custom Code:**
1.  **Write Code**: In the "Run Custom Code" tab, you'll find a text editor where you can write your simulation in JavaScript.
2.  **Debug**: Use `console.log()` to print messages to the output panel below the editor.
3.  **Finish the Experiment**: When your code has generated the results, call the special `hypatia.finish()` function to pass the data to the next step.

```javascript
// This special function connects your code to the app's workflow.
// It takes two string arguments: data and a summary.

hypatia.finish(data, summary);

// EXAMPLE:
const csvData = "time,temperature\n0,20\n1,22\n2,25";
const summaryText = "Simulated temperature increase over 2 seconds.";

hypatia.finish(csvData, summaryText);
```

**B) Upload Own Data:**
-   If you've conducted your experiment offline, use this tab to upload the results.
-   You can first click **Download Template** to have the AI generate a CSV header based on your Data Collection Plan from Step 5, ensuring correct formatting.
-   Then, choose your file and click **Use This Data for Analysis** to send it to Step 7.

**C) Skip & Synthesize Results:**
-   If you don't want to write code or upload data, simply click the **Skip & Synthesize Results** button (available in the "Run Custom Code" tab).
-   The AI will read your methodology and data plans from the previous steps.
-   It will then generate a plausible, synthetic dataset that logically follows from your research design.
-   This synthetic data is then automatically passed to Step 7 for analysis.

---

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## License

Distributed under the MIT License.