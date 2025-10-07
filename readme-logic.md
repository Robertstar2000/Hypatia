# Project Hypatia - Application Logic Outline

This document outlines the logical flow of the Project Hypatia application in a human-readable, indented format.

---

### I. Application Initialization (`App` component)

-   **On first load:**
    -   The `App` component renders and sets an initial `isLoading` state.
    -   An asynchronous function is triggered to load all existing experiments from the browser's local database (IndexedDB via Dexie).
        -   **On success:**
            -   The retrieved experiments are sorted by creation date (newest first).
            -   The sorted array is stored in the `experiments` state.
            -   The most recent experiment is set as the `activeExperiment` to display a summary on the landing page.
        -   **On failure:**
            -   An error is logged to the console, and a "Could not load saved experiments" toast is displayed.
    -   The `isLoading` state is set to `false`, and the main UI is rendered.

---

### II. Core Application Flow (State and View Management)

-   The application's core state (experiments list, active experiment) is managed within the `App` component and provided to the entire component tree via a new **`ExperimentContext`**. This avoids "prop drilling" and centralizes state management.
-   The `App` component uses conditional rendering based on the `view` state variable to switch between the main sections:
    -   **If `view` is `'landing'':** The `LandingPage` component is rendered.
    -   **If `view` is `'dashboard'':** The `Dashboard` component is rendered.
    -   **If `view` is `'experiment'` AND an `activeExperiment` is selected:** The `ExperimentWorkspace` component is rendered.

---

### III. Component Logic Details

#### A. API Key Section (`ApiKeySection`)

-   This component has a single responsibility: to obtain and validate a user-provided Google Gemini API key.
-   The previous "Promo Code" functionality has been **removed** for security and simplicity.
-   **On "Validate & Use Key" click:**
    -   It calls the `testApiKey` service function, which makes a minimal, low-cost API call to check for authentication errors.
    -   **On success:** The Gemini service is initialized with the valid key, and the main application UI is unlocked for the user.
    -   **On failure:** A specific error toast is displayed (e.g., "API Key is not valid").

#### B. Experiment Workspace (`ExperimentWorkspace`)

-   This is the core multi-step interface for a single experiment, consuming data from the `ExperimentContext`.
-   **Sidebar Navigation:**
    -   Loops through all 10 `WORKFLOW_STEPS`.
    -   Highlights the `activeStep`, disables future steps, and shows a checkmark for completed steps.
-   **"Generate" Button Logic:**
    -   Gathers context from previous steps using `getStepContext`. This function now uses concise, AI-generated summaries of past steps instead of the full text, making the process much more efficient.
    -   Constructs the final prompt using `getPromptForStep`.
    -   Calls the Gemini API's streaming endpoint, updating the UI in real-time as the response arrives.
    -   Saves the final output to the database.
-   **"Complete Step & Continue" Button Logic:**
    -   A new, crucial step has been added for efficiency:
        1.  The application takes the final output of the step being completed.
        2.  It makes a separate, quick call to the Gemini API with a prompt to "Concisely summarize the following text...".
        3.  The resulting summary is saved to `stepData[stepId].summary` in the database.
    -   Only after the summary is saved does it increment the experiment's `currentStep`, save the experiment, and advance the user to the next step.
-   **Special Step Rendering:**
    -   **If `activeStep` is 6:** Renders the `ExperimentRunner` component.
    -   **If `activeStep` is 10:** Renders the `PublicationExporter` component.

#### C. AI Output Display (`GeneratedOutput`)

-   Renders AI-generated Markdown into styled HTML.
-   Provides an "Edit" button to allow users to modify and save the AI's output.
-   **Special Logic for Step 7 (Data Analyzer):**
    -   It attempts to parse the AI's output as JSON according to a strict schema.
    -   **On success,** it renders the summary text and uses the `chartSuggestions` data to create interactive charts with Chart.js.
    -   **On failure,** it displays a detailed error message explaining that the AI's response was not in the correct format.

#### D. Experiment Runner (Step 6) (`ExperimentRunner`)

-   A multi-modal component for data generation.
-   **If "Code Simulation" is chosen:**
    -   **Secure Execution:** The AI-generated JavaScript is no longer run in the main browser thread. It is now executed inside a **sandboxed Web Worker**. This is a major security improvement, as it isolates the code from the application's UI and data, preventing potential security risks.
    -   The main application communicates with the worker via a message-passing system to run the code and receive back logs, errors, or the final `hypatia.finish(csv, summary)` result.
-   **If "Manual Entry" is chosen:** The AI generates a dynamic data entry table based on the user's data collection plan.
-   **If "AI Synthesis" is chosen:** The AI generates a complete, plausible dataset based on the project's context.

---

### IV. Implemented Improvements

This version of the application addresses several key problems from the initial prototype.

-   **1. Context Window Optimization:**
    -   **Problem:** Large prompts in late steps were inefficient and costly.
    -   **Solution:** Implemented on-the-fly summarization. Upon step completion, the AI generates a concise summary of the output, which is stored. The `getStepContext` function now uses these summaries for context, dramatically reducing token usage and improving performance.

-   **2. Secure Code Execution:**
    -   **Problem:** Using `new Function()` in the main thread for the code simulator was a potential security risk.
    -   **Solution:** The code simulator now executes JavaScript in a sandboxed Web Worker. This isolates the code from the main application's DOM and global scope, providing a much safer execution environment.

-   **3. Simplified & Secure Authentication:**
    -   **Problem:** The hardcoded "promo code" was insecure and not scalable.
    -   **Solution:** The promo code system has been completely removed. The application now exclusively uses a user-provided API key, which is a more standard and secure approach.

-   **4. Improved State Management:**
    -   **Problem:** "Prop drilling" (passing state down through many component layers) made the code complex and hard to maintain.
    -   **Solution:** The application has been refactored to use React's Context API (`ExperimentContext`). Core application state and update functions are now provided through this central context, simplifying components and making data flow clearer.

-   **5. Enhanced Error Handling:**
    -   **Problem:** API error messages were generic and unhelpful for troubleshooting.
    -   **Solution:** Implemented more specific error handling. The app now inspects API error responses to provide users with actionable feedback (e.g., "API Key is invalid," "A network error occurred," "The model is currently overloaded, please try again.").
