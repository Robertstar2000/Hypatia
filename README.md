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

### **Note: This is a sophisticated frontend-only application that runs entirely in your browser. All project data is securely stored on your local machine using IndexedDB. No backend or sign-up is required.**

---

## Table of Contents

- [About The Project](#about-the-project)
- [Key Features](#key-features)
- [The HMAP Philosophy](#the-hmap-philosophy-human-mediated-agentic-process)
- [The Scientific Method & Hypatia](#the-scientific-method--hypatia)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
  - [1. Choosing Your Workflow: Manual vs. Automated](#1-choosing-your-workflow-manual-vs-automated)
  - [2. The 10-Step Workflow](#2-the-10-step-workflow)
  - [3. Fine-Tuning the AI](#3-fine-tuning-the-ai)
  - [4. The Experiment Runner (Step 6)](#4-the-experiment-runner-step-6)
- [Contributing](#contributing)
- [License](#license)

---

## About The Project

Project Hypatia is your digital lab partner, an AI-powered platform designed to assist researchers, students, and citizen scientists throughout the entire scientific discovery process. It provides a structured, 10-step workflow, leveraging the Google Gemini API to streamline every stage of research, from question formulation to a publication-ready draft. It acts as a comprehensive digital lab notebook, guiding users from an initial spark of an idea to a fully-formed publication draft, all within a single, cohesive interface. The goal is to democratize the research process, offering a structured yet flexible environment for scientific exploration.

<br>

## Key Features

-   ✅ **Local-First Storage**: All project data is stored directly in your browser's **IndexedDB via Dexie.js**—no backend, no sign-ups, no data leaves your machine.
-   🗂️ **Project Dashboard**: A central hub to create, view, manage, archive, and deploy all your research projects.
-   🤖 **Powerful Agentic Workflows**: For key steps, teams of AI agents collaborate to produce high-quality results:
    -   **Agentic Debugger (Step 6)**: An AI writes, runs, and automatically debugs simulation code to ensure it executes successfully.
    -   **Agentic Data Analyst (Step 7)**: A Manager, Doer, and QA agent team work together to determine the best analysis, generate valid charts, and provide a summary.
    -   **Agentic Publication Writer (Step 10)**: An AI team outlines your paper, writes each section, generates chart captions, formats a bibliography, and performs a final editorial review.
-   🕹️ **Dual Workflow Modes**: Choose between **Manual Control** for step-by-step oversight or **Automated Generation** to let the AI complete the entire project from a starting point.
-   🗺️ **Guided 10-Step Workflow**: A structured path from idea to publication, with each step contextually building upon the previous ones.
-   ⚙️ **Fine-Tune AI Parameters**: On a per-step basis, adjust AI settings like a peer reviewer's persona, the level of detail in a methodology, or the novelty of a hypothesis.
-   ✏️ **Editable Outputs**: All AI-generated text can be edited and saved, giving you full control over the research narrative.
-   🔬 **Multi-Modal Experimentation (Step 6)**: A versatile experimental hub with five distinct modes for data generation, including the powerful agentic code simulator.
-   🧠 **Advanced AI Integration**:
    -   **Google Search Grounding**: The Literature Review step uses Google Search to provide up-to-date, cited sources with URLs.
    -   **JSON Mode & Live Charts**: The agentic Data Analyzer uses a strict JSON schema and Chart.js to create live data visualizations.
    -   **Streaming Responses**: AI text streams in token-by-token for a responsive and engaging UI.
-   📚 **In-App Documentation**: This complete user manual is accessible from any screen in the app via the help icon.

---

## The HMAP Philosophy (Human-Mediated Agentic Process)

Project Hypatia is built on the principle of the **Human-Mediated Agentic Process (HMAP)**. This is a framework for human-AI collaboration that emphasizes human agency and control throughout the research lifecycle.

-   **Human as the Director**: You are the principal investigator. The AI is your highly capable, but subordinate, research assistant. It suggests, drafts, and analyzes, but you make the final decisions.
-   **AI as the Agent**: The AI agent (Gemini) executes complex tasks based on your instructions. This includes literature searches, hypothesis generation, data synthesis, and drafting content. In advanced steps, multiple agents collaborate to achieve a goal.
-   **Mediation as the Interface**: The Hypatia application is the "mediation" layer. It structures the interaction, provides tools for control (like fine-tuning and editing), and ensures the workflow remains logical and scientifically rigorous.

HMAP is not about letting an AI run the entire research process. It's about augmenting human intellect and creativity by offloading the tedious and time-consuming aspects of research to an AI partner, freeing you up to focus on critical thinking, interpretation, and discovery.

---

## The Scientific Method & Hypatia

The traditional scientific method is a systematic process for inquiry. Project Hypatia's 10-step workflow is designed to mirror and enhance this process.

| Scientific Method Stage | Corresponding Hypatia Step(s)                                   | How Hypatia Enhances It                                                                                               |
| :---------------------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Observation/Idea**      | `Dashboard` (Create Research Project)                           | Provides a structured way to capture and describe your initial idea.                                                  |
| **Research Question**   | **1.** Research Question                                        | AI helps refine a broad idea into a specific, testable question and scores its uniqueness.                            |
| **Background Research** | **2.** Literature Review                                        | Uses **Google Search grounding** for up-to-date, relevant sources and summarizes them with citations to identify gaps. |
| **Hypothesis**          | **3.** Hypothesis Formulation                                   | AI generates multiple, diverse hypotheses based on the literature, which you can then select or refine.               |
| **Experiment Design**   | **4.** Methodology Design & **5.** Data Collection Plan         | AI drafts a detailed, step-by-step experimental protocol and a corresponding data collection plan for you to approve. |
| **Experimentation**     | **6.** Experiment Runner / Data Synthesis                       | A flexible environment to generate data. Features an **agentic code simulator** that writes, runs, and debugs experiments automatically. |
| **Data Analysis**       | **7.** Data Analyzer                                            | An **AI agent team** analyzes your data, determines the best charts, validates them, and provides a summary with visualizations. |
| **Conclusion**          | **8.** Conclusion Drawing                                       | AI helps you interpret the results, state whether the hypothesis was supported, and discuss implications.             |
| **Communication**       | **9.** Peer Review Simulation & **10.** Publication Exporter | AI simulates a critical peer review to strengthen your arguments, then an **AI agent team** assembles the entire project into a publication draft with embedded charts and a bibliography. |

---

## Technology Stack

This project is built with modern, accessible web technologies.

-   **Frontend**: [React](https://react.dev/) (v19), HTML5, CSS3
-   **Styling**: [Bootstrap 5.3](https://getbootstrap.com/) & [Bootstrap Icons](https://icons.getbootstrap.com/)
-   **AI**: [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash` & `gemini-flash-lite-latest`)
-   **Charts**: [Chart.js](https://www.chartjs.org/)
-   **Client-Side Storage**: [Dexie.js](https://dexie.org/) (IndexedDB Wrapper)
-   **Markdown Rendering**: `marked` library

<br>

## Getting Started

To get a local copy up and running, simply follow these steps.

1.  **Download Files**: Download the repository files (`index.html`, `index.tsx`, `README.md`, etc.).
2.  **Open in Browser**: Open the `index.html` file in a modern web browser (like Chrome, Firefox, or Edge).
3.  **Provide API Access**: Upon loading, the application will prompt you for API access. You have two options:
    -   **API Key (Recommended)**: Provide your own free Google Gemini API key, which you can get from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   **Promo Code**: For demonstration purposes, you can use the promo code `MTI` to use the application with a pre-configured, session-based API key.

    *Security Note*: Your API key is stored in memory for the duration of your session and is never saved or sent to any server besides Google's API endpoints.
4.  **Begin Research**: Once authenticated, you can start creating your first research project!

<br>

## Usage Guide

### 1. Choosing Your Workflow: Manual vs. Automated

After completing Step 1 (Research Question), you will be prompted to choose a workflow mode. This is a critical decision that shapes how you interact with the AI for the rest of the project.

-   **Manual Control**: This is the standard, recommended mode for detailed research. You will proceed step-by-step, generating, reviewing, editing, and approving the AI's output at each stage. This mode gives you maximum control and is ideal when you are providing your own data or need to guide the AI's logic carefully.

-   **Automated Generation**: In this mode, the AI takes over and completes all remaining steps (2 through 10) in one continuous process. It will synthesize its own data in Step 6 and build the entire research project based on its best judgment. This mode is excellent for educational purposes, rapid ideation, or exploring what a full research arc on a topic might look like. *Please be patient, as this process can take several minutes.*

### 2. The 10-Step Workflow

When you open the app, you start on the landing page and can navigate to the **Dashboard**. From there, you can create a new research project or select an existing one. This will take you to the main workspace. If you choose "Manual Control," you will progress through the steps one by one. The AI's output at each step informs the next, creating a cohesive research narrative.

**Full Control**: You have full control over the AI's output.
-   On any step where text has been generated, you will see an **<i class="bi bi-pencil-square"></i> Edit** button.
-   Clicking it turns the text into an editable field. Make your changes and click the **<i class="bi bi-check-lg"></i> Save** button.
-   Your saved version becomes the new "official" output for that step and will be used to provide context for all future AI generations.

### 3. Fine-Tuning the AI

In each step of the workspace, you can click the **<i class="bi bi-sliders"></i> Fine-Tune AI** button. This opens a modal with parameters specific to that step, allowing you to guide the AI's behavior more precisely. For example, you can change the persona of the peer reviewer in Step 9, demand a more detailed methodology in Step 4, or ask for more novel hypotheses in Step 3.

### 4. The Experiment Runner (Step 6)

This step is a powerful, multi-modal hub for generating your experimental data. You will be prompted to choose one of five methods:

**A) Upload Your Data**
-   The most straightforward option. If you have already conducted your experiment and have a dataset, you can directly upload it in CSV format.

**B) External Simulation (Google Colab)**
-   For complex experiments, you can use external tools like Google Colab. Once your simulation is complete, export your data as a CSV and use the **Upload Your Data** option to bring it into Project Hypatia.

**C) Agentic AI Simulation**
1.  **AI Writes the Code**: The AI will read your methodology from Step 4 and automatically write a JavaScript simulation.
2.  **Agentic Debugging**: When you click "Start Agentic Simulation," an AI Debugger agent takes over. It runs the code in a secure sandbox.
3.  **Autonomous Correction**: If the code fails, the Debugger agent analyzes the error, rewrites the code to fix it, and retries. This loop continues until the code runs successfully and produces data, or until it reaches a maximum number of attempts.
4.  **Completion**: The final, working code and its data output are saved to the step.

**D) Dynamic Manual Data Entry**
-   The AI will read your Data Collection Plan from Step 5 and generate a structured data entry table for you to fill in.

**E) AI Data Synthesis**
-   Ideal for theoretical exploration. The AI will read your methodology and generate a plausible, synthetic dataset that logically follows from your research design.

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