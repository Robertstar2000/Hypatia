# Project Hypatia User Manual

Welcome to Project Hypatia! This guide will walk you through everything you need to know to leverage this powerful AI-powered platform for your scientific research.

---

### **Table of Contents**

1.  [Introduction](#1-introduction)
    -   [What is Project Hypatia?](#what-is-project-hypatia)
    -   [The HMAP Philosophy](#the-hmap-philosophy-human-mediated-agentic-process)
    -   [Who is it for?](#who-is-it-for)
2.  [Getting Started](#2-getting-started)
    -   [Authenticating the AI](#authenticating-the-ai)
    -   [Creating Your First Project](#creating-your-first-project)
3.  [The Dashboard: Your Research Hub](#3-the-dashboard-your-research-hub)
    -   [Managing Projects](#managing-projects)
    -   [Importing & Exporting](#importing--exporting-for-collaboration)
4.  [The Experiment Workspace](#4-the-experiment-workspace)
    -   [Workflow Timeline](#workflow-timeline)
    -   [Manual vs. Automated Modes](#manual-vs-automated-workflow-modes)
    -   [Core Actions: Generating, Editing, and Fine-Tuning](#core-actions)
    -   [The Lab Notebook](#the-lab-notebook)
5.  [A Deep Dive into the 10-Step Workflow](#5-a-deep-dive-into-the-10-step-workflow)
6.  [Finalizing & Deploying Your Research](#6-finalizing--deploying-your-research)
7.  [Frequently Asked Questions (FAQ)](#7-frequently-asked-questions-faq)

---

## 1. Introduction

### What is Project Hypatia?

Project Hypatia is your digital lab partner, an AI-powered platform designed to assist researchers, students, and citizen scientists throughout the entire scientific discovery process. It provides a structured, 10-step workflow, leveraging the Google Gemini API to streamline every stage of research, from question formulation to a publication-ready draft. It acts as a comprehensive digital lab notebook, guiding you from an initial spark of an idea to a fully-formed publication, all within a single, cohesive interface.

### The HMAP Philosophy (Human-Mediated Agentic Process)

Project Hypatia is built on the principle of the **Human-Mediated Agentic Process (HMAP)**. This is a framework for human-AI collaboration that emphasizes human agency and control.

-   **You are the Director**: The AI is your highly capable, but subordinate, research assistant. It suggests, drafts, and analyzes, but you make the final decisions.
-   **The AI is the Agent**: The AI (Gemini) executes complex tasks based on your instructions. In advanced steps, multiple AI agents collaborate to achieve a goal.
-   **The Application is the Mediator**: Hypatia structures the interaction, provides tools for control (like fine-tuning and editing), and ensures the workflow remains logical and scientifically rigorous.

### Who is it for?

-   **Students**: Learn the scientific method in a structured, interactive way.
-   **Researchers**: Accelerate your workflow, from literature reviews to drafting papers.
-   **Citizen Scientists**: Explore ideas and conduct research without needing a full lab.
-   **Educators**: A powerful tool for teaching research methodology.

---

## 2. Getting Started

### Authenticating the AI

Project Hypatia is a frontend-only application that runs entirely in your browser. All your project data is stored securely on your local machine using IndexedDB. To activate the AI features, you need to provide API access.

-   **API Key Method (Recommended)**: On the landing page, enter your free Google Gemini API key. You can get a key from [Google AI Studio](https://aistudio.google.com/app/apikey). Your key is stored in memory only for your current session and is never saved.
-   **Promo Code Method**: For demonstration purposes, you can use the promo code `MTI` to use the application with a pre-configured, session-based API key.

### Creating Your First Project

Once authenticated, the landing page will display fields to start a new project:
1.  **Project Title**: A clear, descriptive title.
2.  **Description**: A brief summary of your research idea.
3.  **Scientific Discipline**: Select the field that best fits your project. This helps the AI tailor its responses.
4.  Click **"Begin Research"** to enter the Experiment Workspace.

---

## 3. The Dashboard: Your Research Hub

You can access the Dashboard from the navigation bar. It's the central hub for all your projects.

### Managing Projects

-   **View Project / Continue**: Click this on a card to open the project in the Experiment Workspace.
-   **Archive Project**: Once a project is complete, you can archive it to move it to a separate section of the dashboard, keeping your active workspace clean.
-   **Delete Project**: Permanently removes a project and all its data from your local storage. This cannot be undone.

### Importing & Exporting for Collaboration

While Hypatia doesn't have a real-time collaboration backend, you can share your work:
-   **Export**: Click the "Export" button on any project card to download the entire project as a `.json` file.
-   **Import**: On the dashboard, click "Import Project" and select a `.json` file that was previously exported from Hypatia.

---

## 4. The Experiment Workspace

This is where your research happens. It consists of a navigation sidebar and a main content area.

### Workflow Timeline

The sidebar on the left shows all 10 steps of the research process.
-   <span style="color: var(--primary-glow);">**Blue (Active)**</span>: The current step you are working on.
-   <i class="bi bi-check-circle-fill text-success"></i> **Green Checkmark**: A completed step. You can click on it to view its output.
-   **Grayed Out**: A future step that is not yet accessible.

### Manual vs. Automated Workflow Modes

After completing Step 1, you must choose a workflow mode:
-   **Manual Control**: The standard, recommended mode. You proceed step-by-step, generating, reviewing, editing, and approving the AI's output at each stage. This gives you maximum control.
-   **Automated Generation**: The AI takes over and completes all remaining steps (2 through 10) in one continuous process. This is excellent for rapid ideation or educational purposes. **Please be patient, as this can take several minutes.**

### Core Actions

-   **Generating Content**: In most steps, a "Generate" button will prompt the AI to produce content based on all previous steps.
-   **Editing Output**: All AI-generated text can be edited. Click the <i class="bi bi-pencil-square"></i> **Edit** button, make your changes, and click the <i class="bi bi-check-lg"></i> **Save** button. Your version becomes the new "official" output for that step.
-   **Regenerating**: Click the <i class="bi bi-arrow-clockwise"></i> **Regenerate** button to open a field where you can provide feedback, then have the AI try again.
-   **Fine-Tuning AI**: Click the <i class="bi bi-sliders"></i> **Fine-Tune AI** button to open a modal with parameters specific to the current step, allowing you to guide the AI's behavior more precisely (e.g., change a peer reviewer's persona, request a more detailed methodology).

### The Lab Notebook

Accessible from the header, the Lab Notebook is a free-form text area for your personal notes, observations, or thoughts that don't fit into the structured workflow. It's saved with your project.

---

## 5. A Deep Dive into the 10-Step Workflow

1.  **Research Question**: Refine your initial idea into a testable question. The AI will also provide a **Uniqueness Score** and justification, indicating how novel the question is based on its knowledge.
2.  **Literature Review**: The AI uses **Google Search grounding** to find up-to-date, relevant sources. It provides a summary and a structured list of references with links.
3.  **Hypothesis Formulation**: The AI generates several distinct, testable hypotheses based on the literature review.
4.  **Methodology Design**: The AI drafts a detailed, step-by-step experimental protocol.
5.  **Data Collection Plan**: The AI details how you will collect, record, and organize data.
6.  **Experiment Runner / Data Synthesis**: This is a powerful virtual lab with five distinct modes:
    -   **Upload Your Data**: Upload your own dataset in CSV format.
    -   **External Simulation (Google Colab)**: Guidance for using external tools and then uploading the results.
    -   **Agentic AI Simulation**: In this mode, an AI agent writes JavaScript code for your experiment, then another AI agent (the Debugger) runs the code, catches errors, and rewrites it until it succeeds. This agentic process is unique to Step 6.
    -   **Manual Data Entry**: The AI generates a structured table for you to fill in.
    -   **AI Data Synthesis**: The AI generates a plausible, synthetic dataset for theoretical exploration.
7.  **Data Analyzer**: A team of AI agents collaborates to analyze your data. A **System Agent** finds insights, a **Manager** sets a goal, a **Doer** generates a Chart.js visualization, and a **QA Agent** validates it. This loop repeats until a valid chart is produced.
8.  **Conclusion Drawing**: The AI helps you interpret the results and state whether the hypothesis was supported.
9.  **Peer Review Simulation**: The AI simulates a critical peer review of your entire project to help you identify weaknesses.
10. **Publication Exporter**: A team of AI agents collaborates to write a complete, publication-ready draft. They outline the paper, write each section, generate captions for your charts, format a bibliography, and perform a final editorial review.

---

## 6. Finalizing & Deploying Your Research

After completing Step 10, the project is considered complete and can be accessed from the Dashboard. The "Deploy" modal offers several final outputs:

-   **Submission Checklist**: Generates a checklist of common requirements for submitting to a scientific journal.
-   **Presentation Outline**: Creates a 10-slide outline for a conference presentation based on your paper.
-   **Download Paper**: Export the final publication in various formats:
    -   Markdown (`.md`)
    -   Plain Text (`.txt`)
    -   Word Document (`.doc`)
    -   PDF (via your browser's print function)
-   **Download Shareable Summary**: Creates a self-contained HTML file of your paper, perfect for sharing.

---

## 7. Frequently Asked Questions (FAQ)

-   **Is my data private?**
    -   Yes. All your research data is stored exclusively in your browser's local IndexedDB. It is never sent to any server except for the necessary API calls to Google Gemini during generation. No one but you has access to your projects.

-   **What if the AI gets stuck or gives a bad response?**
    -   You have two options: use the **Regenerate** button with feedback, or simply click the **Edit** button and correct the output yourself. You always have the final say.

-   **Why do the agentic steps (Code Simulator, Data Analyzer) sometimes pause or say "Retrying"?**
    -   To ensure high-quality results and manage API usage, the AI agents have built-in persistence. When an agent's attempt to write code or analyze data fails, it pauses briefly (a 1-second delay between major attempts) to re-evaluate. If an API call fails (e.g., due to a temporary network issue), the system will automatically retry with an increasing delay (2s, 4s, 8s...). This "agentic stamina" allows the AI to overcome transient errors and solve more complex problems without you needing to intervene.

-   **How long does "Automated Generation" take?**
    -   It can take several minutes. The AI is performing 9 complex steps, including summarizations and agentic workflows, so please be patient.

-   **Can I collaborate with others?**
    -   You can use the **Export** and **Import** features on the Dashboard to share entire projects with other Project Hypatia users.