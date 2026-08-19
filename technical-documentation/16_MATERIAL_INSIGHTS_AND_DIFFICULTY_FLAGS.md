# 16. Material Insights and Difficulty Flags

## 1. Contextual Difficulty Flagging Architecture

Lumora captures granular friction points during student study by enabling candidates to pin **Difficulty Flags** to specific video seconds or PDF pages.

```mermaid
graph TD
    Student[Student in Classroom] --> Viewer[MaterialViewer: Video / PDF]
    Viewer --> FlagModal[Difficulty Flag Modal: Auto-captures 04:30 or Page 13]
    FlagModal --> API_Flag[POST /api/materials/id/flag]
    API_Flag --> DB_Flag[(material_flags table)]
    
    DB_Flag --> AnalyticsEngine[material_analytics.py: Aggregates Hotspots]
    AnalyticsEngine --> HotspotHeatmap[Material Heatmap Visualization]
    
    DB_Flag --> TeacherQueue[/dashboard/teacher/qa & Analytics Tab 4]
    TeacherQueue --> TeacherReply[POST /api/materials/flags/flag_id/reply]
    TeacherReply --> StudentNotif[Notifies Student & Displays Guidance in Viewer]
```

---

## 2. Telemetry Ingestion & Hotspot Aggregation

### 2.1. Ingestion Protocol
- **Endpoint**: `POST /api/materials/{id}/flag`
- **Payload Schema**:
  ```json
  {
    "context": "Timestamp 04:30",
    "comment": "Unclear how the electron transport chain maintains the proton gradient."
  }
  ```
- **Storage**: Persisted to `material_flags` and mirrored in `material_difficulty_hotspots`.

### 2.2. Content Friction Ratio ($F_{\text{material}}$)
In [`material_analytics.py`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/backend/app/services/analytics/material_analytics.py), the engine computes a friction ratio comparing student views against total confusion flags:
$$F_{\text{material}} = \frac{N_{\text{total flags}}}{N_{\text{total views}}} \times 100$$
- **High Friction Threshold** ($F > 15\%$): Automatically flags the material in the Teacher Analytics Workstation as requiring pedagogical review, additional explanatory notes, or a follow-up live discussion.

---

## 3. Teacher Heatmap & Resolution Workflow

### 3.1. Material Heatmap Component (`MaterialHeatmap.tsx`)
Rendered in [`frontend/src/components/charts/MaterialHeatmap.tsx`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/components/charts/MaterialHeatmap.tsx):
- **Video Materials**: Displays a longitudinal timeline representing video duration in 30-second bins, highlighting clusters of flags with gradient intensity.
- **PDF Documents**: Displays a page-by-page bar chart indicating flag density per page.

### 3.2. Teacher Moderation & Feedback Loop
1. Instructors access flagged items via [`/dashboard/teacher/insights/hotspots`](file:///d:/BSc%20SE/Final%20Project/lumora_LMS/frontend/src/app/dashboard/teacher/insights/hotspots/page.tsx) or Tab 4 (Materials) of the Teacher Analytics Workstation.
2. The teacher reviews the student's comment and submits a clarifying response via `POST /api/materials/flags/{flag_id}/reply`.
3. The flag is marked `is_resolved = True` with `resolved_at = NOW()`, resolving the hotspot in aggregate analytics and updating the student's material view.
