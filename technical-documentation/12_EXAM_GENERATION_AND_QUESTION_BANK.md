# 12. Exam Generation and Question Bank

## 1. Exam Authoring & Question Bank Architecture

Lumora provides a dual authoring ecosystem enabling teachers to construct national-standard assessment papers either through manual authoring or via **Google Gemini AI generation** adhering strictly to A/L syllabus blueprints.

```mermaid
graph TD
    Teacher[Teacher / Curriculum Designer] --> AuthoringHub[/dashboard/teacher/al-exams/create]
    AuthoringHub --> ManualDrafting[Manual Question Authoring Form]
    AuthoringHub --> AIGenerator[Gemini AI Question Generator]
    AuthoringHub --> QuestionBankPool[Question Bank Repository]

    subgraph AI Generation Pipeline
        AIGenerator --> MCQGen[al_mcq_generator.py: 7 Templates]
        AIGenerator --> StructGen[al_structured_generator.py: Subpart Trees]
        AIGenerator --> EssayGen[al_essay_generator.py: Rubric Checklists]
        
        MCQGen --> GeminiAPI[Google Gemini 2.0 Flash]
        StructGen --> GeminiAPI
        EssayGen --> GeminiAPI
    end

    subgraph Question Bank Repository
        ManualDrafting --> BankDB[(al_questions & question_pools)]
        GeminiAPI --> BankDB
        BankDB --> ExamAssembly[Exam Assembly & Publishing Engine]
        ExamAssembly --> PublishedExam[al_exams: Published Paper]
    end
```

---

## 2. AI Question Generation Pipelines

Located in [`backend/app/services/`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/), specialized generator services handle format-specific generation constraints:

### 2.1. Paper I MCQ Generator (`al_mcq_generator.py`)
- **Supported Formats**: 7 templates (`generic_mcq`, `multi_response_grid`, `five_statement_truth`, `matching_column`, `combination_grid`, `sequential_diagnostic`, `incomplete_stem`).
- **Prompt Structure**:
  - Requires exactly 5 options (A, B, C, D, E).
  - Explicitly commands the LLM to generate believable, plausible non-functional distractors and provide step-by-step scientific explanations for the correct key.
  - Classifies Bloom's cognitive level (`remember`, `understand`, `apply`, `analyze`, `evaluate`) and estimated completion time.

### 2.2. Paper II-A Structured Generator (`al_structured_generator.py`)
- **Structure**: Generates a main clinical/experimental stem followed by a multi-level subpart hierarchy.
- **Output JSON Schema**:
  ```json
  {
    "stem_text": "An investigation was conducted on the rate of photosynthesis in Hydrilla...",
    "diagram_url": null,
    "requires_image": false,
    "structured_subparts_json": [
      {
        "id": "q1_a",
        "part": "(a)",
        "prompt": "State two environmental factors kept constant during this experiment.",
        "max_points": 2.0,
        "lines": 2,
        "expected_keywords": ["temperature", "carbon dioxide concentration"]
      },
      {
        "id": "q1_b_i",
        "part": "(b)(i)",
        "prompt": "Explain the biochemical mechanism responsible for oxygen evolution.",
        "max_points": 4.0,
        "lines": 4,
        "expected_keywords": ["photolysis of water", "photosystem II", "manganese cluster"]
      }
    ]
  }
  ```

### 2.3. Paper II-B Essay Generator (`al_essay_generator.py`)
- **Structure**: Generates an extended analytical prompt accompanied by an explicit 10–15 item marking scheme checklist.
- **Output JSON Schema**:
  ```json
  {
    "stem_text": "Describe the structural adaptations of the human nephron for urine formation.",
    "points": 40.0,
    "essay_checklist_json": [
      {"item_number": 1, "criterion_text": "State structure and podocyte arrangement of Bowman's capsule", "max_points": 4.0},
      {"item_number": 2, "criterion_text": "Explain counter-current multiplier mechanism in Loop of Henle", "max_points": 4.0},
      {"item_number": 3, "criterion_text": "Detail ADH action on aquaporin-2 in collecting ducts", "max_points": 4.0}
    ]
  }
  ```

---

## 3. Question Bank & Pool Management

### 3.1. Reusable Question Repository
Questions marked with `is_banked = True` in `al_questions` reside in the central **Question Bank** ([`/dashboard/teacher/question-bank`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/question-bank/page.tsx)). Teachers can filter questions by topic, cognitive level, template type, and difficulty, and assemble new practice papers or midterm examinations directly from the repository.

### 3.2. Safe Exam Deletion with Question Preservation
When an instructor deletes an examination on [`/dashboard/teacher/al-exams`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/al-exams/page.tsx), the system presents an interactive **Exam Deletion Modal**:
- **Keep Questions in Question Bank (Recommended)** (`delete_banked_questions = false`): Removes the assessment container while keeping all individual question items banked for future exam creation.
- **Permanently Delete Questions** (`delete_banked_questions = true`): Cascades deletion across both the exam and banked question records.

### 3.3. Scientific Symbol Picker Modal
To facilitate mathematical and chemical notation without requiring LaTeX knowledge, authoring forms embed the [`ScientificSymbolPickerModal.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/al-exams/ScientificSymbolPickerModal.tsx), offering categorized Unicode symbols (Greek letters $\alpha, \beta, \gamma, \Delta$, arrows $\rightarrow, \rightleftharpoons, \uparrow$, math $\pm, \times, \div, \le, \ge$, chemical ions $\text{H}^+, \text{OH}^-, \text{ATP}, \text{NADPH}$).
