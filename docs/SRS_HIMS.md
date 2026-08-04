# Software Requirements Specification (SRS)
## Hospital Incident Management System (HIMS)
### For: Jaiprakash Hospital & Research Centre

---

## Chapter 1 – Introduction

### 1.1 Purpose
The purpose of this Software Requirements Specification (SRS) is to define the functional, non-functional, technical, security, and business requirements for the Hospital Incident Management System (HIMS) to be implemented at Jaiprakash Hospital & Research Centre.

This document serves as the official reference for all stakeholders involved in the project, including hospital management, quality assurance teams, developers, UI/UX designers, database architects, testers, DevOps engineers, and future maintenance teams.

The system is designed to digitize and automate the complete hospital incident management lifecycle, replacing manual paper-based processes with a secure, centralized, and traceable web application.

The Hospital Incident Management System will enable employees to report incidents, route them through departmental review, investigation, management approval, corrective actions, training assignments, and final closure while maintaining complete auditability, compliance, and reporting capabilities.

This SRS provides a comprehensive blueprint for the development, testing, deployment, operation, and future enhancement of the application using the PERN Stack (PostgreSQL, Express.js, React, Node.js) with Cloudflare R2 as cloud storage for attachments and reports.

### 1.2 Scope
The Hospital Incident Management System (HIMS) is a secure, role-based web application developed to improve patient safety, employee accountability, hospital quality management, and regulatory compliance by managing all hospital incidents through a standardized digital workflow.

The application supports the complete incident lifecycle, beginning with incident reporting by hospital employees and ending with management review, corrective actions, training assignments, and final incident closure.

The scope of the system includes:

#### Incident Reporting
Employees can:
- Create new incident reports
- Save incident reports as drafts
- Upload supporting documents, photographs, and evidence
- Track submitted incidents
- View incident status and timeline
- Receive notifications
- View investigation reports after closure
- View assigned training status

#### Department Review
Department Heads (HODs), Incharges, or Assistant COOs can:
- Review incidents assigned to their departments
- Submit departmental feedback
- Upload supporting evidence
- Recommend corrective actions
- Request incident redirection when another department is responsible
- Track SLA deadlines
- Receive automated reminders

#### Investigation Management
The Incident Management Committee (IMC) can:
- Review all incidents
- Approve or reject redirect requests
- Assign investigators
- Escalate incident priority
- Review departmental findings
- Verify investigations
- Monitor department performance
- Track SLA compliance
- Analyze department-wise statistics
- Monitor employee incident history
- Verify training completion

#### Investigation Activities
Assigned investigators can:
- View assigned investigations
- Submit investigation findings
- Upload investigation evidence
- Perform Root Cause Analysis (RCA)
- Recommend Corrective and Preventive Actions (CAPA)

#### Management Review
Management can:
- Review IMC findings
- Return incomplete investigations
- Approve investigations
- Assign employee training
- Generate official hospital reports
- Monitor departmental performance
- Monitor IMC performance
- Close incidents after successful completion of all required actions

#### System Administration
System Administrators can:
- Manage users & roles
- Configure departments
- Assign HODs, Incharges, or Assistant COOs
- Configure IMC members, Management users, and investigators
- Configure SLA settings
- Monitor audit logs, notification delivery, and login history
- Configure master data & system settings
*(Note: The System Administrator cannot modify or delete investigation findings or management decisions to preserve data integrity and audit compliance.)*

#### Reporting & Analytics
The system shall provide:
- Department-wise & Employee-wise analytics
- Monthly & Yearly reports
- Incident trends & SLA compliance reports
- Training completion & Management performance reports
- HOD & IMC response time analysis
- Incident closure statistics

#### Notifications
The application shall support:
- Website notifications
- Email notifications
- WhatsApp notifications
- Future Push Notifications

#### Security
The application shall provide:
- JWT Authentication & Role-Based Access Control (RBAC)
- Secure file storage using Cloudflare R2
- Audit logging & Session management
- Secure password hashing (bcrypt)
- API security, HTTPS communication, Rate limiting, Input validation

#### Deployment
The application shall be deployed using:
- Docker & Docker Compose
- Nginx, PostgreSQL, Redis, BullMQ
- Cloudflare R2 & GitHub Actions CI/CD

### 1.3 Objectives
- **Business Objectives**: Digitize reporting, reduce paperwork, improve patient safety and operational efficiency, standardize procedures, ensure regulatory compliance (NABH standards), maintain complete audit trails, and reduce response times.
- **Technical Objectives**: PERN Stack, JWT auth, secure file storage, scalable RESTful APIs, real-time notifications, high availability.
- **User Objectives**: Tailored workflows enabling rapid incident reporting for employees, efficient department review for HODs, robust investigation oversight for IMC members, comprehensive governance for Management, and secure administration for IT staff.

### 1.4 Definitions
| Term | Definition |
| :--- | :--- |
| **Incident** | Any unexpected event affecting patient safety, staff safety, equipment, or hospital operations. |
| **Near Miss** | An event that could have caused harm but did not because of chance or timely intervention. |
| **Sentinel Event** | A serious unexpected occurrence involving death, serious injury, or significant risk requiring immediate investigation. |
| **Root Cause Analysis (RCA)** | A structured investigation to identify the underlying causes of an incident. |
| **Corrective Action** | An action taken to eliminate the cause of an identified problem. |
| **Preventive Action** | An action implemented to prevent recurrence of similar incidents. |
| **Investigation** | The formal review process conducted after an incident to determine facts, causes, and recommendations. |
| **Incident Closure** | The final stage where all required reviews, actions, and training have been completed and the case is officially closed. |
| **SLA** | Service Level Agreement defining maximum response times for different stages of the incident workflow. |
| **Dashboard** | A graphical interface displaying incident statistics, analytics, and pending tasks for users based on their roles. |

### 1.5 Acronyms
| Acronym | Meaning |
| :--- | :--- |
| **HIMS** | Hospital Incident Management System |
| **HOD** | Head of Department |
| **IMC** | Incident Management Committee |
| **CAPA** | Corrective and Preventive Action |
| **RCA** | Root Cause Analysis |
| **SLA** | Service Level Agreement |
| **JWT** | JSON Web Token |
| **RBAC** | Role-Based Access Control |
| **R2** | Cloudflare R2 Object Storage |

### 1.6 References
- IEEE 29148:2018 & IEEE 830 Standards for Software Requirements Specifications
- OWASP Top 10 Web Application Security Risks & WCAG 2.1 AA Accessibility Guidelines
- NABH Quality and Patient Safety Guidelines & Hospital Internal SOPs
- PERN Stack (PostgreSQL, Express, React 19, Node.js), Redis, BullMQ, Cloudflare R2

### 1.7 Document Overview
This SRS covers 20 structured chapters defining Introduction, Overall Description, Business/Functional Requirements, Workflows, Modules, RBAC, Use Cases, Dashboards, UI/UX, Database, APIs, Frontend/Security/Deployment Architecture, and Testing Strategy.

---

## Chapter 2 – Overall Description

### 2.1 Existing System
At present, Jaiprakash Hospital & Research Centre manages incidents manually using paper forms, emails, telephone calls, and spreadsheets. Each department follows its own process for reporting and resolving incidents, leading to inconsistent documentation and delayed investigations.

The current system has several limitations:
- Incident reports are manually maintained with no centralized incident database.
- Difficult to track incident progress or SLAs.
- No automatic notifications or reminders.
- Limited accountability and difficult audit report generation.
- No department performance analytics or employee incident history.
- Difficult to maintain NABH compliance.

### 2.2 Proposed System
The proposed solution is a web-based Hospital Incident Management System (HIMS) developed using the PERN Stack.

#### Technology Stack
| Layer | Technology |
| :--- | :--- |
| **Frontend** | React.js + Vite |
| **Backend** | Node.js + Express.js |
| **Database** | PostgreSQL |
| **ORM** | Prisma / Raw SQL Pool |
| **Authentication** | JWT + Refresh Token |
| **Object Storage** | Cloudflare R2 |
| **Charts** | Recharts |
| **PDF Generation** | Puppeteer |
| **Excel Export** | ExcelJS |
| **Notification** | Socket.IO + Email + WhatsApp |
| **Deployment** | Docker |

### 2.3 System Objectives
- Digitize the complete incident lifecycle and reduce paperwork.
- Improve patient safety, accountability, and management visibility.
- Monitor departmental performance and track SLAs.
- Generate automated reports and maintain complete audit logs.
- Support NABH hospital quality accreditation.

### 2.4 Product Perspective
The Hospital Incident Management System functions as an independent enterprise web application that integrates with hospital employee records. It provides Role-Based Access Control (RBAC), multi-department workflows, SLA monitoring, notification services, analytics dashboards, audit trails, and secure cloud file storage.

### 2.5 Product Functions
- **Authentication**: Registration, Login, JWT verification, Password Reset, Session Management.
- **Employee**: Report incident, View incident timeline/status, Withdraw incident, Receive notifications.
- **HOD / Incharge / Assistant COO**: Review department incidents, Submit feedback, Request department redirects, Upload evidence, Monitor SLAs.
- **IMC**: Investigate incidents, Assign investigators, Review redirect requests, Escalate priority, Return incident to HOD, Verify training, Generate investigation reports.
- **Management**: Review investigation findings, Return to IMC if incomplete, Assign responsible employees and mandatory training, Generate final reports, Close incidents, Monitor performance.
- **System Administrator**: User & Role management, HOD/Incharge/COO mappings, SLA configuration, Notification monitoring, Audit logs & analytics.

### 2.6 User Classes
| User | Description |
| :--- | :--- |
| **Employee** | Reports hospital incidents |
| **HOD** | Reviews department incidents |
| **Incharge** | Acts as HOD where applicable |
| **Assistant COO** | Reviews incidents for assigned departments |
| **Investigator** | Conducts investigations assigned by IMC |
| **IMC** | Investigates, approves redirects, verifies training |
| **Management** | Final review, training assignment, and incident closure |
| **System Administrator** | System configuration, mappings, and monitoring |

### 2.7 Operating Environment
- **Client Web Browsers**: Google Chrome, Microsoft Edge, Mozilla Firefox, Safari.
- **Operating Systems**: Windows, Linux, macOS.
- **Mobile Devices**: Responsive web support for Android and iOS.

### 2.8 Constraints & Assumptions
- **Constraints**: Availability of Office Portal API, Internet connectivity, WhatsApp Business API, and Cloudflare R2 object storage.
- **Assumptions**: Every employee has a unique Employee ID; departments are predefined; roles are assigned by System Administrators; all access is over secure HTTPS.

---

## Chapter 3 – System Architecture

### 3.1 Overall Architecture
```
                    Users
                       │
                       ▼
              React.js Frontend
                       │
          REST API (HTTPS + JWT)
                       │
                       ▼
           Express.js Backend Server
      ┌──────────┬────────────┬────────────┐
      │          │            │            │
      ▼          ▼            ▼            ▼
 PostgreSQL   Cloudflare R2  Socket.IO  Email/WhatsApp
   Database     Storage       Notifications
```

### 3.2 Frontend Architecture
Organized modularly under `src/`:
`components/`, `pages/`, `layouts/`, `routes/`, `hooks/`, `services/`, `store/`, `utils/`, `context/`, `assets/`, `validations/`.

### 3.3 Backend Architecture
Organized modularly under `server/`:
`controllers/`, `routes/`, `middleware/`, `services/`, `prisma/` (migrations/db), `validators/`, `sockets/`, `config/`, `utils/`, `app.js`.

### 3.4 Cloudflare R2 Integration
Cloudflare R2 securely stores all incident attachments, HOD evidence, IMC investigation files, training certificates, final reports, and generated PDFs. PostgreSQL stores precise metadata (file name, object key, uploader, MIME type, upload date).

---

## Chapter 4 – Authentication & Authorization

### 4.1 Overview
The Hospital Incident Management System (HIMS) uses a Role-Based Access Control (RBAC) mechanism to ensure that every user accesses only the features and data permitted by their assigned role. Authentication is handled using JSON Web Tokens (JWT), while authorization is enforced through middleware on every protected API endpoint.

### 4.2 Login Process
Every user logs in from the standardized login page.
- **Credentials**: Employee ID (Text, Required) and Password (Password, Required).
- **Flow**: Open Login Page $\rightarrow$ Enter Employee ID & Password $\rightarrow$ Validate Credentials $\rightarrow$ Generate JWT $\rightarrow$ Load Dashboard Based on Role.

### 4.3 User Registration
Only System Administrators can create user accounts directly (or via Office Portal API verification).
- **Captured Attributes**: Employee ID, Employee Name, Email, Mobile Number, Department, Designation, Role(s), Status.
- **Storage**: Passwords are securely hashed using `bcrypt` (12 rounds).

### 4.4 Authentication
- **Access Token**: Valid for 15 minutes; authenticates every protected API request via `Authorization: Bearer <token>` header.
- **Refresh Token**: Valid for 7 days; stored securely in HTTP-only cookies to rotate access tokens without forcing re-login.

### 4.5 Authorization & Multi-Role Support
Enforced via RBAC across 8 distinct classes: `Employee`, `HOD`, `Incharge`, `Assistant COO`, `Investigator`, `IMC`, `Management`, and `System Administrator`.
- **Multi-Role Switching**: If an employee has multiple roles assigned (e.g., Employee + HOD + Investigator), they can switch active dashboards dynamically without having to log out and log back in. Every switch is logged for auditability.

### 4.6 Password Policy & Forgot Password
- **Policy**: Minimum 8 characters, including at least one uppercase letter, one lowercase letter, one number, and one special character.
- **Forgot Password Workflow**: Click Forgot Password $\rightarrow$ Enter Employee ID & Registered Email $\rightarrow$ Verify Email $\rightarrow$ Receive OTP via Email $\rightarrow$ Submit OTP + New Password $\rightarrow$ Set New Password & Sign In.

### 4.7 Session Management & Account Status
- **Session Rules**: Automatic logout after configurable inactivity (e.g., 30 minutes), refresh token rotation, and concurrent token misuse prevention.
- **Account States**: Active, Inactive, Suspended, or Locked (after repeated failed attempts).

### 4.8 Login Audit
Every login attempt records: Employee ID, Date & Time, Client IP Address, Browser / User Agent, Device Type, and Authentication Status (Success / Failure).

### 4.9 Authentication APIs
| API Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/forgot-password` | POST | Request OTP for password reset |
| `/api/auth/verify-otp` | POST | Verify password reset OTP |
| `/api/auth/reset-password` | POST | Set new password |
| `/api/users/register` | POST | Create user (System Admin only) |

---

## Chapter 5 – Employee Module

### 5.1 Module Overview & Objectives
The Employee Module is the primary entry point of the Hospital Incident Management System (HIMS). It allows staff to report incidents quickly, monitor the status of submitted incidents, receive real-time updates, and track the full lifecycle of reported events until resolution.

### 5.2 Employee Dashboard
Provides a personalized overview of employee reporting activity.
- **Summary Cards**: Total Incidents, Active Incidents, Closed Incidents, Draft Incidents, Pending HOD Review, Pending IMC Review, and Pending Management Review.
- **Widgets**:
  - *Recent Incidents*: Table displaying the 5 most recent submissions (Ref Number, Title, Date Reported, Status, Priority, Action).
  - *Notifications Feed*: Live updates on acceptance, feedback, redirects, investigations, training assignments, and closures.
  - *Incident Statistics*: Monthly reporting charts and category/status distribution pie charts.

### 5.3 Report New Incident (Form Structure)
- **Section A – Reporter Information (Read-Only auto-populated)**: Employee ID, Name, Department, Designation, Email, Mobile Number.
- **Section B – Incident Information (Mandatory)**: Incident Title, Category, Type, Severity, Date & Time of Incident, Location, Sub-Location, Department(s) Involved.
- **Section C – Incident Description**: Rich text editor describing what happened, how it happened, who was involved, immediate action taken, and remarks (100 to 5,000 characters).
- **Section D – Attachments**: Upload up to 10 files (JPG, PNG, PDF, DOCX, MP4, XLSX) up to 20MB per file stored securely in Cloudflare R2.
- **Section E – Witness Information (Optional)**: Witness Name, Department, Contact Number.
- **Section F – Suggested Immediate Action (Optional)**: Reporter's recommended corrective actions.
- **Auto-Save Drafts Enhancement**: Form state automatically saves every 30 seconds or on field changes to prevent data loss in busy hospital environments.

### 5.4 Incident Submission Workflow & Reference Number
- **Workflow**: Fill Form $\rightarrow$ Validate Fields $\rightarrow$ Upload Attachments to R2 $\rightarrow$ Generate Reference Number $\rightarrow$ Save to PostgreSQL $\rightarrow$ Dispatch Notifications $\rightarrow$ Assign to Department HOD(s).
- **Reference Format**: Standardized unique identifier such as `JPHRC-IMS-2026-000001` (Hospital Code + Module + Year + Sequence).

### 5.5 Incident Status Lifecycle & Details Page
- **Lifecycle Statuses**: `Draft`, `Submitted`, `Assigned to HOD`, `HOD Review in Progress`, `Redirect Requested`, `Redirect Approved`, `IMC Investigation`, `Returned to HOD`, `Returned by Management`, `Management Review`, `Training Assigned`, `Training Verification`, `Closed`.
- **Details View**: Full timeline view displaying chronological state transitions and file download capabilities. Once submitted, employees cannot edit reports or view confidential review feedback until policy permits.

### 5.6 Functional Requirements & REST APIs
| ID | Requirement Description |
| :--- | :--- |
| **FR-EMP-001** | Allow employees to submit a structured incident report. |
| **FR-EMP-002** | Automatically populate reporter information from authenticated session. |
| **FR-EMP-003** | Generate unique immutable reference number (`JPHRC-IMS-YYYY-XXXXXX`). |
| **FR-EMP-004** | Upload supporting attachments to Cloudflare R2 object storage. |
| **FR-EMP-005** | Notify assigned HODs immediately upon submission. |
| **FR-EMP-006 to 010** | Provide timeline tracking, search & filter, audit logs, and immutability locks post-submission. |

#### REST API Endpoints
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/incidents` | Create incident report / save draft |
| `GET` | `/api/incidents/my` | Retrieve employee's submitted incidents |
| `GET` | `/api/incidents/:id` | Get full incident details and timeline |
| `POST` | `/api/incidents/:id/attachments` | Upload file attachments |
| `GET` | `/api/notifications` | Retrieve real-time user notifications |

---

## Chapter 6 – HOD / Incharge / Assistant COO Module

### 6.1 Module Overview & User Roles
The HOD, Incharge, and Assistant COO Module manages departmental investigation, feedback submission, root cause identification, and redirection workflows within defined Service Level Agreements (SLAs).
- **HOD (Head of Department)**: Primary reviewer for assigned clinical or administrative departments.
- **Incharge**: Acts with full departmental HOD authority for departments lacking an official HOD.
- **Assistant COO**: Oversees multiple mapped departments and exercises review authority when HODs/Incharges are unavailable or have delegated authority.

### 6.2 Departmental Dashboard & Monitoring Cards
- **Summary Cards**: Total Assigned Incidents, Pending Feedback, Active Incidents, Resolved Incidents, Redirect Requests, Overdue SLA, and Escalated Incidents.
- **Widgets**:
  - *Recent Assigned Incidents*: Table displaying Reference Number, Title, Severity, Assigned Date, SLA Remaining, Status, and View Action.
  - *Department Performance*: Key departmental KPIs including total volume, average feedback turnaround time, SLA compliance percentage, and Active vs. Closed ratios.
  - *Notifications Feed*: Real-time alerts for new assignments, SLA reminders (Day 5), SLA breach warnings (Day 7), priority escalations, and IMC redirect adjudications.

### 6.3 Assigned Incident List & Detail View
- **List Table & Filters**: Paginated table supporting multi-criteria filtering by timeframe (Today, This Week, This Month), severity, status, priority, and specific mapped department (for Assistant COOs).
- **Incident Detail View**: Full visibility of original employee narrative description, reporter profile, location metadata, supporting R2 attachments, and historical audit timeline.

### 6.4 Department Feedback Submission & Drafts
The departmental reviewer submits structured findings:
- **Form Fields**: Departmental Root Cause, Findings, Immediate Action Taken, Corrective Action Recommendation, Preventive Action Recommendation, Remarks, and up to 10 file attachments (PDF, DOCX, JPG, PNG stored in Cloudflare R2).
- **Draft Functionality**: Reviewers can save work-in-progress drafts (`Save Draft`) visible exclusively to the departmental reviewer until formal submission (`Submit Feedback`).

### 6.5 Redirect Request & Adjudication Workflow
If an assigned incident falls outside the department's responsibility, the reviewer initiates a formal redirect request to the Incident Management Committee (IMC):
- **Workflow**: Click `Request Redirect` $\rightarrow$ Select Suggested Responsible Department $\rightarrow$ Enter Mandatory Justification Reason $\rightarrow$ Upload Evidence (Optional) $\rightarrow$ Submit Request.
- **IMC Adjudication**: While pending, the incident remains tracked under the requesting department. If IMC approves, the incident re-routes to the correct department and the SLA countdown resets.

### 6.6 SLA Governance & Multi-Department Oversight
- **SLA Monitoring**: Default 7-day turnaround timer initiated upon incident assignment. Automated notifications fire on Day 5 (Warning) and Day 7 (Breach alert to HOD & IMC).
- **Assistant COO & Incharge Oversight**: Assistant COOs automatically inherit operational review access across all assigned departments (e.g., Pharmacy, Maintenance, Housekeeping) with actions recorded distinctly in the audit trail.

### 6.7 Functional Requirements & REST APIs
| ID | Requirement Description |
| :--- | :--- |
| **FR-HOD-001 to 003** | Display assigned department queues, submit structured feedback, and auto-save local drafts. |
| **FR-HOD-004 to 006** | Initiate redirect requests with mandatory reasons, monitor SLAs, and dispatch warning alerts. |
| **FR-HOD-007 to 010** | Upload evidence to R2, support Assistant COO multi-department mapping, Incharge delegation, and audit logging. |

#### REST API Endpoints
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/hod/dashboard` | Departmental analytical dashboard metrics |
| `GET` | `/api/hod/incidents` | Retrieve paginated queue of assigned incidents |
| `GET` | `/api/hod/incidents/:id` | Get incident details and departmental feedback form |
| `POST` | `/api/hod/incidents/:id/feedback` | Submit final departmental investigation feedback |
| `PUT` | `/api/hod/incidents/:id/draft` | Save or update departmental feedback draft |
| `POST` | `/api/hod/incidents/:id/redirect` | Request departmental redirection to IMC |
| `POST` | `/api/hod/incidents/:id/attachments` | Upload supporting evidence files |

---

## Chapter 7 – Incident Management Committee (IMC) Module

### 7.1 Module Overview & Objectives
The Incident Management Committee (IMC) Module serves as the central investigation and quality governance unit of HIMS. After departmental reviews are completed, incidents route to the IMC for independent investigation, validation, Root Cause Analysis (RCA), Corrective and Preventive Action (CAPA) planning, investigator assignments, redirect decisions, training recommendations, and preparation for Management review.

### 7.2 IMC Dashboard & Widgets
- **Summary Cards**: Total Incidents, Active Investigations, Awaiting IMC Review, Redirect Requests, Escalated Incidents, Overdue SLA, Training Pending Verification, Resolved Investigations, and Watchlist Cases.
- **Widgets**:
  - *Recent Investigations Table*: Displays Reference Number, Title, Department, Severity, Assigned Investigator, Days Open, Current Status, and Action.
  - *Organization Summary*: Department-wise statistics, open/closed ratio, SLA compliance rate, average investigation turnaround, and critical incident count.
  - *Notifications Feed*: Alerts for incoming submissions, redirect requests, returned cases, escalations, investigator findings, and training verifications.

### 7.3 Investigation & Review Workflows
- **Incident Details View**: Displays full reporter profile, original description, timeline, departmental feedback (immediate actions, findings, RCA, CAPA), and complete audit logs.
- **Official Investigation Form (Mandatory fields for submission)**:
  - Investigation Summary
  - Root Cause Analysis (RCA)
  - Corrective Action
  - Preventive Action (CAPA)
  - Investigation Findings & Recommendations
  - Supporting Attachments (stored in Cloudflare R2)
- **Investigator Assignment**: IMC can search and delegate specific investigations to designated hospital Investigators. Investigators upload findings and evidence but cannot close incidents or modify original reports.
- **Redirect Request Management**: Approve or reject HOD departmental redirect requests. Approval reassigns the case and restarts the SLA.
- **Return to HOD**: Return incomplete submissions (e.g., missing RCA or insufficient evidence) back to the department with mandatory feedback reasons.
- **Priority Escalation & Watchlist**: Escalate priority (Minor $\rightarrow$ Moderate $\rightarrow$ Major $\rightarrow$ Critical) and pin critical sentinel events to the Watchlist for continuous monitoring.
- **Training Recommendations & Verification**: Suggest training topics and departments post-investigation. Verify attendance certificates and completion evidence after Management mandates training.

### 7.4 Advanced Enterprise Features (Recommendations)
1. **Investigation Checklist**: Mandatory pre-submission gate verifying that employee statements, HOD feedback, attachments, RCA, CAPA, and training needs have been formally reviewed.
2. **Duplicate Incident Detection**: Automated scanning flagging similar historical incidents within the past 12 months based on category, location, and keywords.
3. **Incident Risk Matrix**: Automated Likelihood × Impact classification determining a standardized risk rating (Low, Medium, High, Extreme).

### 7.5 Functional Requirements & REST APIs
| ID | Requirement Description |
| :--- | :--- |
| **FR-IMC-001** | View and filter hospital-wide incidents across all departments. |
| **FR-IMC-002** | Conduct structured RCA and CAPA investigations. |
| **FR-IMC-003** | Delegate investigations to specialized investigators. |
| **FR-IMC-004** | Evaluate and adjudicate department redirect requests. |
| **FR-IMC-005 to 010** | Return incomplete cases, escalate priority, verify training, and generate executive reports. |

#### REST API Endpoints
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/imc/dashboard` | Dashboard summary metrics |
| `GET` | `/api/imc/incidents` | Organization-wide incident list |
| `GET` | `/api/imc/incidents/:id` | Full investigation view |
| `POST` | `/api/imc/incidents/:id/investigation` | Submit RCA/CAPA investigation |
| `POST` | `/api/imc/incidents/:id/assign-investigator` | Assign investigator |
| `POST` | `/api/imc/incidents/:id/redirect-decision` | Approve/reject redirect request |
| `POST` | `/api/imc/incidents/:id/return-hod` | Return incident to department |
| `POST` | `/api/imc/incidents/:id/escalate` | Escalate incident priority |
| `POST` | `/api/imc/training/:id/verify` | Verify employee training completion |
| `GET` | `/api/imc/reports` | Generate analytics reports |

---

## Chapter 8 – Management Module

### 8.1 Module Overview & Objectives
The Management Module represents the ultimate decision-making authority in HIMS. Management evaluates completed IMC investigations, determines organizational or individual accountability, assigns mandatory employee training and organizational CAPA tasks, authorizes official hospital investigation reports, and performs final incident closures.

### 8.2 Executive Dashboard & Alerting
- **Summary Cards**: Total Incidents, Pending Management Review, Active Incidents, Closed Incidents, Returned to IMC, Critical Incidents, Training Pending, SLA Breached, and Watchlist Incidents.
- **Executive Widgets**: Daily/Weekly/Monthly metrics summaries, recent incidents table, and real-time executive alerts (e.g., critical unreviewed sentinel events, department SLA breaches, training backlog).

### 8.3 Management Review & Decision Workflows
- **Incident Details 5-Section View**:
  1. *Employee Report*: Original details and attachments.
  2. *Department Review*: Complete HOD feedback, findings, and response times.
  3. *IMC Investigation*: Complete RCA, CAPA, investigator notes, and findings.
  4. *Lifecycle Timeline*: Chronological progression through all workflow gates.
  5. *Audit Trail*: Immutable timestamped history of all user interactions.
- **Investigation Review**: Management can approve the IMC investigation or return it to IMC with mandatory justification if findings or root causes are incomplete.
- **Accountability Determination**: Identify and link responsible employees or designate the issue explicitly as a **System / Process Failure** to ensure objective organizational accountability.
- **Corrective Action & Training Mandates**: Assign organizational CAPA actions with target completion dates and owners. Mandate employee training (e.g., Medication Safety, Fire Safety, Infection Control) triggering automated workflow notifications.
- **Training Verification Gate**: Mandated training must be completed by the employee, verified by the IMC, and reviewed by Management prior to closure.

### 8.4 Official Report Generation & Incident Closure
- **Hospital-Branded PDF Report**: Generates an official print-ready PDF containing hospital branding, executive summary, complete findings, RCA/CAPA, training records, remarks, and digital closure certificate.
- **Exclusive Closure Authority**: Management is the **only** role authorized to close incidents.
- **Pre-Closure Gate**: Closure is prohibited unless departmental feedback, IMC investigation, redirect requests, mandatory training verifications, and final report generation are 100% complete. Once closed, the incident becomes read-only across the entire hospital.

### 8.5 Advanced Enterprise Features (Recommendations)
1. **Executive Decision Register**: Formal log recording every management decision (approval, return, training mandate, closure) with digital signatures and timestamps.
2. **CAPA Tracking Dashboard**: Active governance tracker monitoring implementation progress (Pending / In Progress / Completed) and verification evidence for assigned corrective actions.
3. **Organization Performance Scorecard**: High-level scorecard tracking hospital-wide SLA compliance rates and department turnaround times for NABH accreditation audits.

### 8.6 Functional Requirements & REST APIs
| ID | Requirement Description |
| :--- | :--- |
| **FR-MGMT-001** | View and monitor organization-wide incident queues. |
| **FR-MGMT-002** | Review and adjudicate IMC investigation submissions. |
| **FR-MGMT-003** | Return incomplete investigations back to IMC with feedback. |
| **FR-MGMT-004 to 006** | Assign accountability, organizational CAPA, and mandatory employee training. |
| **FR-MGMT-007** | Generate official hospital-branded PDF investigation reports. |
| **FR-MGMT-008 to 010** | Track executive analytics, monitor departmental SLAs, and enforce pre-closure gates. |

#### REST API Endpoints
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/management/dashboard` | Executive dashboard summary |
| `GET` | `/api/management/incidents` | Organization-wide management incident queue |
| `GET` | `/api/management/incidents/:id` | Comprehensive 5-section incident view |
| `POST` | `/api/management/incidents/:id/approve` | Approve IMC investigation |
| `POST` | `/api/management/incidents/:id/return` | Return investigation to IMC |
| `POST` | `/api/management/incidents/:id/training` | Assign mandatory employee training |
| `POST` | `/api/management/incidents/:id/close` | Final incident closure |
| `GET` | `/api/management/reports` | Generate executive analytical reports |

---

## Chapter 9 – System Administrator Module

### 9.1 Module Overview & Objectives
The System Administrator (Super Admin) is responsible for configuring, maintaining, and monitoring HIMS. Unlike operational roles, the Administrator does not participate in investigations or submit incident feedback, and cannot view confidential narrative descriptions or review comments. Instead, the Administrator manages users, roles, department hierarchies, SLAs, notifications, integrations, master data, audit logs, and overall system health.

### 9.2 Dashboard & Monitoring Cards
- **Summary Cards**: Total Employees, Active Users, Inactive Users, Total Incidents, Active Incidents, Closed Incidents, SLA Breaches, Notifications Sent Today, Failed Notifications, and Active Investigators.
- **Widgets**:
  - *Incident & User Summaries*: Counts across timeframes and roles.
  - *System Status Monitor*: Health indicators for PostgreSQL, Cloudflare R2, SMTP Email Service, WhatsApp API, Task Scheduler, and Background Job Queue.

### 9.3 User, Role, and Hierarchy Management
- **User Management**: Create accounts, activate/deactivate/lock/unlock status, reset passwords, update profiles, and view login histories.
- **Multi-Role Assignment**: Assign one or multiple roles (`Employee`, `HOD`, `Incharge`, `Assistant COO`, `Investigator`, `IMC`, `Management`, `System Administrator`).
- **Department & COO Mapping**: Map specific HODs, Incharges, and Assistant COOs to departments. Assistant COOs automatically inherit oversight across mapped departments.
- **Investigator Management**: Designate or remove specialized hospital investigators and monitor active/completed investigation workloads.

### 9.4 SLA, Notification, and Master Data Configuration
- **SLA Configuration**: Set default turnaround thresholds (e.g., HOD Feedback = 7 Days, IMC Investigation = 7 Days, Management Review = 5 Days, Training Verification = 7 Days) and configure automated reminder/escalation schedules (Day 3, Day 5, Final Day).
- **Notification Management**: Monitor Website, Email, and WhatsApp delivery queues (Pending, Sent, Delivered, Failed, Retrying) with manual retry triggers.
- **Master Data & Integrations**: Manage departments, categories, types, severity/risk levels, locations, buildings, floors, and templates. Configure R2 storage parameters, SMTP, and API keys.

### 9.5 Advanced Enterprise Features (Recommendations)
1. **Feature Flags**: Dynamic toggle allowing optional modules (e.g., WhatsApp notifications, Office Portal integration, AI categorization) to be enabled/disabled without server redeployment.
2. **API & Integration Monitor**: Real-time latency and connectivity dashboard tracking SMTP, WhatsApp, R2, database pool, and job queue health.
3. **Security Center**: Dedicated threat monitor surfacing failed login spikes, locked accounts, expired passwords, active session counts, and role elevation events.

### 9.6 Functional Requirements & REST APIs
| ID | Requirement Description |
| :--- | :--- |
| **FR-ADM-001** | Manage user credentials, accounts, and profile states. |
| **FR-ADM-002** | Assign single or multiple RBAC roles to employees. |
| **FR-ADM-003** | Configure workflow SLAs, reminder days, and escalation rules. |
| **FR-ADM-004 to 006** | Monitor multi-channel notifications, view immutable audit logs, and manage investigators. |
| **FR-ADM-007 to 010** | Configure department mappings, master data, system health, and integrations. |

#### REST API Endpoints
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/admin/dashboard` | System administrator overview metrics |
| `GET` | `/api/admin/users` | Retrieve paginated user directory |
| `POST` | `/api/admin/users` | Create new user account |
| `PATCH` | `/api/admin/users/:id/status` | Activate, deactivate, or lock user account |
| `POST` | `/api/admin/users/:id/roles` | Update user RBAC roles |
| `GET` | `/api/admin/slas` | Retrieve SLA configurations |
| `PATCH` | `/api/admin/slas/:id` | Update SLA parameters |
| `GET` | `/api/admin/audit-logs` | Query system audit logs |
| `GET` | `/api/admin/system-health` | Check PostgreSQL, Redis, R2, and SMTP health |
| `GET` | `/api/admin/master-data` | Retrieve system master data tables |

---

## Chapter 10 – Incident Workflow & Business Process

### 10.1 Overview & Complete Lifecycle
HIMS enforces a standardized, multi-tier state machine designed to route hospital incidents seamlessly across six distinct operational layers: `Employee`, `Department (HOD/Incharge/COO)`, `IMC`, `Investigator`, `Management`, and `System Administrator`. Every state transition is strictly timestamped, immutable in the audit logs, and tied to automated multi-channel notifications and SLA timers.

```
┌─────────────────────┐
│ Employee Reports    │
└──────────┬──────────┘
           │
           ▼
Automatic Incident Number Generation
           │
           ▼
Department Assignment & SLA Timer Starts
           │
           ▼
HOD / Incharge Review
           │
      ┌────┴────┐
      │         │
      ▼         ▼
Feedback   Redirect Request
      │         │
      │         ▼
      │      IMC Decision
      │     ┌────┴────┐
      │     │         │
      │  Reject    Approve
      │     │         │
      ▼     │         ▼
      └─────┴──► Correct Department
                 │
                 ▼
         IMC Investigation
                 │
      ┌──────────┴───────────┐
      ▼                      ▼
Assign Investigator     Direct Investigation
      │                      │
      ▼                      ▼
Investigation Submitted
                 │
                 ▼
Management Review
      ┌──────────┴────────────┐
      ▼                       ▼
Return to IMC           Approve Investigation
                              │
                              ▼
Training Decision
      ┌──────────┴───────────┐
      ▼                      ▼
Training Required       No Training
      │                      │
      ▼                      ▼
Training Completed      Close Incident
      │
      ▼
IMC Verification
      │
      ▼
Management Closure
```

### 10.2 Incident States
| State | Description |
| :--- | :--- |
| **Draft** | Saved locally by employee; unsubmitted and editable |
| **Submitted** | Formal submission accepted; reference number assigned |
| **Assigned to Department** | Routed to responsible HOD/Incharge/Assistant COO |
| **HOD Review** | Active departmental investigation and feedback preparation |
| **Redirect Requested** | HOD requested redirection to another department |
| **Redirect Approved** | IMC approved redirection; SLA restarted under new department |
| **IMC Investigation** | Active quality oversight and RCA/CAPA preparation by IMC |
| **Investigator Assigned** | Delegated to specialized investigator for fieldwork |
| **Investigation Submitted** | Complete findings submitted to Management for governance |
| **Returned by Management** | Returned to IMC for deeper analysis or missing evidence |
| **Training Assigned** | Mandatory employee training assigned prior to resolution |
| **Training Verification** | Attendance and completion certificates awaiting IMC validation |
| **Closed** | Final closure certified by Management; record locked read-only |

### 10.3 Core Operational Workflows
- **Employee Workflow**: Create, save draft, upload evidence to R2, submit, and track chronological progression. Prohibited from editing/deleting submitted records or reading confidential review text.
- **Department Workflow**: Notification triggers immediate SLA countdown. HOD must submit findings/immediate actions or formally request a redirect with mandatory justification. Unresolved queues escalate on Day 3, Day 5, and threshold breach.
- **Redirect Workflow**: If HOD identifies an incorrect departmental assignment, a redirect request routes to IMC. If approved, the case re-routes to the correct department and resets the SLA timer.
- **IMC & Investigator Workflows**: IMC evaluates HOD findings, conducts RCA/CAPA, or assigns an Investigator. Investigators upload evidence and findings directly to the case file.
- **Management & Training Workflows**: Executive review gate. Management approves or returns findings, evaluates accountability, mandates training, verifies IMC training certificates, and executes final closure.
- **Notification & Audit Workflows**: Multi-channel alerts (Web, Email, WhatsApp) dispatch on submission, assignment, reminders, redirects, training mandates, and closure. Every user action records immutably in the system audit log.

### 10.4 Advanced Enterprise Features (Recommendations)
1. **Incident Reopening**: Allows Management to reopen closed incidents if new regulatory requirements or critical evidence emerge, preserving original reference IDs.
2. **Incident Merge & Link**: Enables IMC to merge duplicate reports of the same event into a primary master record while preserving individual reporter timelines.
3. **Actionable CAPA Task Tracking**: Converts CAPA text into tracked organizational tasks assigned to specific owners with due dates and verification evidence.
4. **Automatic Risk Scoring**: Algorithmically assigns an initial risk score (Low to Extreme) based on severity, category, department history, and patient impact.
5. **Escalation Matrix**: Automated hierarchical escalations: HOD SLA breach $\rightarrow$ Assistant COO $\rightarrow$ IMC $\rightarrow$ Management $\rightarrow$ Hospital Director/COO.

### 10.5 Functional Requirements
| ID | Requirement Description |
| :--- | :--- |
| **FR-WF-001 to 003** | Enforce automated state transitions, track progression, and maintain timeline integrity. |
| **FR-WF-004 to 005** | Monitor stage-specific SLAs and generate multi-channel alerts. |
| **FR-WF-006 to 008** | Manage redirect adjudications, investigator delegation, and mandatory training gates. |
| **FR-WF-009 to 010** | Generate immutable audit logs and prevent illegal state transitions. |

---

## Chapter 11 – Database Design (PostgreSQL + Prisma ORM)

### 11.1 Database Architecture & Core Design Principles
- **Engine & ORM**: PostgreSQL 16+ paired with Prisma ORM (`snake_case` database identifiers, `PascalCase` Prisma models).
- **Design Principles**: Third Normal Form (3NF), Soft Deletes (`deleted_at`), UUID primary keys (`@db.Uuid`), foreign key referential integrity, indexed search columns, ACID transaction boundaries, and optimistic concurrency.
- **Universal Audit Columns**: Every relational entity incorporates standardized tracking metadata: `id` (UUID), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP), `deleted_at` (NULLABLE TIMESTAMP), `created_by` (UUID), and `updated_by` (UUID).

### 11.2 Modular Logical Architecture (16 Modules)
1. **Authentication**: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `login_history`, `refresh_tokens`, `password_reset_tokens`, `otp_requests`, `active_sessions`.
2. **Organization**: `departments`, `designations`, `buildings`, `floors`, `locations`, `hospital_units`.
3. **Employee**: `employees`, `employee_contacts`, `employee_documents`, `employee_training_history`.
4. **Incident**: `incidents`, `incident_categories`, `incident_types`, `incident_status`, `incident_priorities`, `incident_severity`, `incident_departments`, `incident_watchlist`.
5. **Attachments**: `attachments`, `attachment_versions`, `attachment_download_logs` (stores metadata; binaries reside in Cloudflare R2).
6. **Department Review**: `hod_feedback`, `hod_feedback_attachments`, `redirect_requests`, `redirect_history`.
7. **Investigation**: `investigations`, `investigators`, `investigator_assignments`, `investigation_findings`, `investigation_attachments`.
8. **RCA / CAPA**: `root_cause_analysis`, `corrective_actions`, `preventive_actions`, `capa_tasks`, `capa_progress` (modeled as actionable tracked tasks).
9. **Training**: `trainings`, `training_assignments`, `training_attendance`, `training_certificates`, `training_verifications`.
10. **Management**: `management_reviews`, `management_decisions`, `final_reports`, `closure_records`.
11. **Notifications**: `notifications`, `notification_templates`, `notification_queue`, `email_logs`, `whatsapp_logs`, `push_logs`.
12. **Audit**: `audit_logs`, `activity_logs`, `system_logs`, `security_logs`.
13. **SLA**: `sla_configurations`, `sla_history`, `sla_escalations`.
14. **Analytics**: `dashboard_cache`, `monthly_statistics`, `yearly_statistics` (cached aggregations preventing heavy query loads).
15. **Master Data**: `risk_levels`, `training_types`, `root_cause_categories`, `action_categories`, `incident_sources`, `notification_channels`.
16. **System Administration**: `system_settings`, `feature_flags`, `api_integrations`, `backup_history`, `scheduled_jobs`.

### 11.3 Core Entity Specifications & Cloudflare R2 Structure
- **incidents Table**: `id` (UUID), `reference_number` (VARCHAR), `title` (VARCHAR), `description` (TEXT), `reporter_id` (UUID), `severity_id` (UUID), `priority_id` (UUID), `status_id` (UUID), `occurrence_date` (DATE), `occurrence_time` (TIME), `location_id` (UUID), `risk_score` (INTEGER), `created_at` (TIMESTAMP).
- **attachments Table**: `id`, `incident_id`, `uploaded_by`, `original_name`, `object_key`, `bucket`, `mime_type`, `file_size`, `checksum`, `uploaded_at`.
- **Cloudflare R2 Object Storage Tree**: Structured chronologically and functionally: `hospital-ims/incident-attachments/YYYY/MM/INCIDENT-ID/filename.ext`, `hod-feedback/`, `imc-investigation/`, `training-certificates/`, and `reports/`.

### 11.4 Indexing, Soft Deletes, and Transactions
- **Index Strategy**: Single indexes on `employee_id`, `reference_number`, `status_id`, `department_id`, `severity_id`, `priority_id`, `created_at`. Composite indexes on `(department_id, status_id)`, `(status_id, priority_id)`, and `(reference_number, status_id)`.
- **Soft Deletes**: Physical deletions are strictly prohibited across incidents, feedback, investigations, reports, and audit logs to guarantee regulatory NABH compliance.
- **ACID Transactions**: Mandatory transaction wrappers for multi-table writes (incident creation, redirect approval, investigation submission, training assignment, closure).

---

## Chapter 12 – API Specifications (REST API)

### 12.1 API Standards & Layered Architecture
- **Base URI**: `/api/v1` (versioned namespace supporting seamless backward compatibility).
- **Architecture Flow**: React Frontend (React Query + Axios) $\rightarrow$ Express REST API Layer $\rightarrow$ Controller Layer $\rightarrow$ Service / Business Logic Layer $\rightarrow$ Repository (Prisma ORM) $\rightarrow$ PostgreSQL.
- **Standard Request Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`, `Accept: application/json`, `X-Request-ID`, `X-Device-ID`, `X-App-Version`.
- **Standard Response Payloads**:
  - *Success*: `{ "success": true, "message": "...", "data": {}, "meta": {}, "timestamp": "ISO-8601" }`
  - *Error*: `{ "success": false, "message": "...", "errors": [{ "field": "...", "message": "..." }], "timestamp": "ISO-8601" }`

### 12.2 Comprehensive REST Endpoint Specifications
- **Authentication**: `POST /auth/login`, `/logout`, `/refresh-token`, `/forgot-password`, `/verify-otp`, `/reset-password`, `GET /auth/me`, `/sessions`, `DELETE /auth/sessions/:id`.
- **Employee**: `GET /employee/dashboard`, `/incidents`, `/incidents/:id`, `/incidents/:id/timeline`, `POST /employee/incidents`, `/incidents/draft`, `/incidents/:id/attachments`, `PUT /employee/incidents/draft/:id`.
- **HOD / Department**: `GET /hod/dashboard`, `/incidents`, `/incidents/:id`, `POST /hod/incidents/:id/feedback`, `/redirect`, `/attachments`, `PUT /hod/incidents/:id/draft`.
- **IMC Investigation**: `GET /imc/dashboard`, `/incidents`, `POST /imc/incidents/:id/assign-investigator`, `/investigation`, `/priority`, `/redirect/:id/approve`, `/reject`, `/training/:id/verify`.
- **Investigator**: `GET /investigator/dashboard`, `/incidents`, `POST /investigator/incidents/:id/findings`, `/attachments`.
- **Management Governance**: `GET /management/dashboard`, `POST /management/incidents/:id/approve`, `/return`, `/training`, `/report`, `/close`.
- **System Administrator**: Full CRUD across `/admin/users`, `/roles`, `/departments`, `/sla`, `/audit`, `/notifications`.
- **Reports & Analytics**: `GET /reports/monthly`, `/yearly`, `/departments`, `/employees`, `/training`, `GET /analytics/dashboard`, `/departments`, `/system`.
- **Cloudflare R2 Object Storage**: `POST /storage/upload`, `GET /storage/download/:id`, `/storage/:id`, `DELETE /storage/:id`.

### 12.3 Real-Time WebSocket Architecture (Socket.IO)
- **Server Events**: Emitted in real-time on `incident_created`, `incident_updated`, `incident_closed`, `notification_created`, `sla_breached`, `training_assigned`, `training_completed`.
- **Client Events**: Handled via `join_room`, `leave_room`, and `mark_notification_read`.

### 12.4 Security, Versioning & Enterprise Best Practices
- **Security Protections**: Mandatory JWT bearer validation, Zod request body validation, Helmet HTTP headers, CORS policies, role-based rate limiting (100 to 600 req/min), input sanitization, and structured distributed tracing (`X-Request-ID`).
- **Enterprise Recommendations**:
  1. *OpenAPI / Swagger Docs*: Auto-generating interactive Swagger UI from Express routes.
  2. *Idempotency Keys*: Supporting `Idempotency-Key` headers on critical mutations (`POST /incidents`, `/close`, `/training`) to prevent duplicate execution on network retries.
  4. *Clean Feature-First Architecture*: Structuring codebases by domain (`server/modules/auth`, `employee`, `incident`, `hod`, `imc`, `management`, `admin`) rather than monolithic technical layers.

---

## Chapter 13 – Frontend UI/UX Specification

### 13.1 UI Technology Stack & Styling Foundation
- **Core Framework & Libraries**: React 19 (Vite) with Lucide React icons, Recharts for visual charts, Tailwind CSS utility classes, Zod validation, and Zustand / Context state management.
- **Color Palette & Theme**:
  - *Primary Hospital Blue*: `#0F4C81`
  - *Secondary Medical Green*: `#2E8B57`
  - *Status Alerting*: Warning `#FF9800`, Critical `#E53935`, Success `#43A047`, Background `#F8FAFC`.
  - *Theme Modes*: Light Mode, Dark Mode, System Theme, and custom Hospital Green Theme toggles.
- **Typography**: Inter font family with clean fallback to Roboto.

### 13.2 Structural Layout & Navigation Design
- **App Layout Tree**: Standard shell consisting of top Header (Search, Notifications bell, Theme toggle, Profile badge), Role-Driven Sidebar navigation (Employee, HOD, IMC, Management, Admin), dynamic Main Workspace, and Hospital Footer.
- **Login Page Architecture**: Responsive split-screen design. Left hero panel features hospital branding, architectural illustration, and welcome messaging. Right panel presents standardized employee authentication forms (`Employee ID` + `Password` + `Forgot Password` 2-step verification).

### 13.3 Dashboard Workspaces & Data Tables
- **Universal Dashboard Layout**: Standard visual flow across all roles: Metric Summary Cards (Icons, counts, percentage trends) $\rightarrow$ Analytics Charts (Bar, Pie, Line) $\rightarrow$ Actionable Data Tables $\rightarrow$ Live Notification Feeds.
- **Enterprise Incident List Table**: Feature-rich interactive table supporting sorting, multi-criteria filtering, column visibility toggles, Excel/CSV exports, search, pagination, and color-coded status badges.

### 13.4 Incident Details View & Component Hierarchy
- **Modular Tabbed Interface**: Tabbed structure loading independently for speed: Overview, Lifecycle Timeline, Attachments, Department Feedback, IMC Investigation, Training Verification, Audit Trail, and Final Report.
- **Component Tree Structure**:
  ```
  App
   ├── Auth (Login, Forgot Password, Reset Password)
   ├── Layout (Header, Sidebar, Breadcrumbs, NotificationBell, Footer)
   ├── Dashboard (DashboardCards, IncidentChart, RecentIncidents, SLAWidget)
   ├── Incident (IncidentTable, IncidentDetails, Timeline, Attachments, Feedback, Investigation, Report)
   ├── Reports & Analytics
   └── Shared (DataTable, Modal, ConfirmDialog, FileUploader, Charts, FormField)
  ```

### 13.5 Accessibility, Loading & Error States
- **Accessibility Compliance**: WCAG 2.1 AA compliant, full keyboard accessibility, clear ARIA labels, focus rings, and high contrast contrast compliance.
- **Resilience Design**: Skeleton loading screens, lazy suspense boundaries, structured empty states ("No incidents found"), and clear HTTP error screens (403 Forbidden, 404 Not Found, 500 Internal Error) with retry hooks.

### 13.6 Advanced Enterprise UX Enhancements (Recommendations)
1. **Universal Command Palette (Ctrl + K)**: Fast keyboard-driven command modal allowing rapid jump-to-incident by reference ID, employee search, and menu navigation.
2. **Personalized Dashboard Layouts**: Drag-and-drop customizable dashboard cards enabling staff to save tailored workspace arrangements.
3. **Saved Search Filters & Bulk Actions**: Storing custom table filters ("SLA Breaches", "Critical Review") and executing batch operations across multiple records.
4. **Real-Time Collaboration Indicators**: Presence badges ("IMC Member A is currently reviewing this incident") preventing concurrent conflicting reviews.

---

## Chapter 14 – Non-Functional Requirements (NFR)

### 14.1 Overview & Performance Benchmarks
Non-functional requirements guarantee that HIMS operates securely, scalably, and reliably under clinical workload stresses while adhering to NABH hospital compliance frameworks.
- **Maximum Response Times**: Login $\le$ 2s, Dashboard Load $\le$ 3s, Incident List $\le$ 2s, Incident Details $\le$ 3s, Report Generation $\le$ 10s, File Upload $\le$ 30s (100MB payload), Global Search $\le$ 1s, Real-Time Notifications $\le$ 5s.
- **Concurrency & Throughput**: Supporting 500 simultaneous active users across 5,000 registered hospital accounts, processing 100 concurrent submissions and 50 simultaneous PDF report generations at a sustained throughput of 10,000 API requests/minute.

### 14.2 Scalability, Availability & High Reliability
- **Horizontal Clustering**: Scalable deployment architecture routing through Load Balancers $\rightarrow$ Clustered Node.js instances $\rightarrow$ Redis Caching $\rightarrow$ PostgreSQL Primary/Replica DBs $\rightarrow$ Cloudflare R2 object buckets.
- **High Availability**: Target uptime of **99.9%** (maximum annual unplanned downtime $< 8$ hours).
- **Zero Data Loss Guarantee**: ACID database transactions ensuring that incidents, attachments, HOD feedback, investigations, reports, and audit trails are never lost during system faults.

### 14.3 Security, Password Policy & Session Rules
- **Authentication & Encryption**: Multi-layer security combining short-lived JWT Access Tokens (15 min), HTTP-only Refresh Tokens (7 days), and `bcrypt`/Argon2 hashing.
- **Strict Password Policy**: Minimum 10 characters enforcing uppercase, lowercase, numeric, and special characters. Password history prevents reusing the last 5 passwords.
- **Session Governance**: Configurable 30-minute inactivity auto-logout and automatic session invalidation upon password reset or role modification.

### 14.4 Disaster Recovery, Data Retention & NABH Compliance
- **Disaster Recovery Objectives**: Recovery Time Objective (RTO) = **4 Hours**; Recovery Point Objective (RPO) = **15 Minutes**. Automated daily PostgreSQL backups retained for 90 days with R2 versioning enabled.
- **Configurable Data Retention**: Incidents, final reports, and supporting attachments retained permanently (or per hospital quality policy); system audit logs retained for 7 years; login logs retained for 1 year.
- **Regulatory Compliance**: Full NABH electronic record integrity, comprehensive auditability, WCAG 2.1 AA accessibility, and sanitized error handling preventing production stack trace leaks.

### 14.5 Functional Compliance Requirements Table
| ID | Requirement Description |
| :--- | :--- |
| **NFR-001 to 003** | Meet response time SLAs ($\le 2$s login/list), enforce RBAC security, and achieve 99.9% uptime. |
| **NFR-004 to 006** | Support horizontal Node/Redis clustering, automated daily DB backups, and 4-hour RTO. |
| **NFR-007 to 010** | Ensure WCAG 2.1 AA accessibility, multi-browser support, structured request logging, and NABH data retention compliance. |

---

## Chapter 15 – Security Architecture

### 15.1 Defense-in-Depth Security Layers
HIMS implements strict multi-tier security layers across every infrastructure component:
```
React Frontend (HTTPS/TLS 1.3)
       │
       ▼
Nginx Reverse Proxy + WAF
       │
       ▼
Express API (Helmet, CORS, Rate Limiting)
       │
       ▼
JWT Authentication & RBAC Middleware
       │
       ▼
Prisma ORM + PostgreSQL + Redis + Cloudflare R2
```

### 15.2 Authentication & Token Strategy
- **Token Configuration**: Short-lived JWT Access Tokens (15 Minutes validity) passed via `Authorization: Bearer <token>` headers; secure HTTP-only Refresh Tokens (7 Days validity) stored securely hashed in the database; Password Reset & OTP tokens (5 to 15 Minutes validity).
- **Multi-Factor Authentication (Future)**: Support for Email OTP and TOTP authenticator apps for elevated administrative roles (`Management`, `IMC`, `System Administrator`).

### 15.3 Authorization (RBAC) & Password Security
- **Role-Based Access Control**: Middleware validates JWT authenticity, active session state, role assignments, department mappings, and record ownership prior to executing controller logic across all 8 user roles.
- **Cryptographic Standards**: Passwords hashed using `Argon2id` (or `bcrypt` with minimum cost factor 12). Policy requires 10+ characters with mixed case, numbers, and symbols alongside password history tracking.

### 15.4 Data Encryption & Cloudflare R2 Security
- **In-Transit & At-Rest Encryption**: TLS 1.2+ for network transport. Hashed refresh tokens, encrypted database volumes, and automatic Cloudflare R2 encryption at rest.
- **Signed Object Downloads**: Attachments in R2 are accessed exclusively via time-limited signed download URLs generated by backend APIs rather than public buckets.
- **File Upload Protection**: Whitelisted extensions (`PDF`, `DOCX`, `XLSX`, `JPG`, `PNG`); blocked executables/scripts (`EXE`, `BAT`, `JS`, `SH`). File MIME types, SHA-256 checksums, and size boundaries validated before upload.

### 15.5 Input Validation, OWASP Top 10 & Audit Protections
- **Input Sanitization**: Strict schema validation using Zod on every API request. Prisma ORM parameterized queries eliminate SQL injection vectors. Content Security Policy (CSP) and escaping prevent XSS.
- **Immutable Audit Logging**: Append-only audit logs recording every login, logout, password change, permission modification, and incident review decision.
- **Secrets & Rate Limiting**: Strict environment variable injection (`JWT_SECRET`, `DATABASE_URL`). Role-specific rate limits (e.g., Login limited to 5 attempts per 15 minutes).

### 15.6 Advanced Enterprise Security Recommendations
1. **Fine-Grained Permissions**: Introducing granular permission tokens (`incident:create`, `incident:view:own`, `report:generate`) layered above RBAC roles.
2. **Security Event Dashboard**: Dedicated threat monitoring view surfacing account lockouts, suspicious API bursts, and permission elevation alerts.
3. **Data Loss Prevention (DLP)**: PDF watermarks on generated hospital reports and strict rate limiting on bulk data exports.

---

## Chapter 16 – Deployment Architecture

### 16.1 Containerized Microservices & Infrastructure Overview
HIMS utilizes a containerized architecture deploying isolated Docker services orchestrated via Docker Compose and managed under automated CI/CD pipelines.
```
                        Internet (Cloudflare DNS + WAF)
                                       │ HTTPS (TLS 1.3)
                                       ▼
                         Nginx Reverse Proxy & SSL
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
React Frontend Container    Express API Node Cluster    Socket.IO Realtime Engine
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       ▼
       ┌───────────────────────────────┴───────────────────────────────┐
       ▼                               ▼                               ▼
PostgreSQL 16 Engine        Redis Caching & Queue Pool      Cloudflare R2 Object Store
```

### 16.2 Docker Containers & Service topology
- **Container Roles**: `frontend` (React 19 Vite app), `backend` (Express API cluster), `postgres` (Primary DB), `redis` (Cache & BullMQ queue pool), `nginx` (Reverse proxy & SSL termination), `worker` (BullMQ asynchronous jobs), and monitoring containers (`prometheus`, `grafana`, `loki`).
- **Nginx Routing Strategy**: Routes `/` to frontend assets, `/api` to Express REST servers, `/socket.io` to WebSocket instances, and executes dynamic Gzip/Brotli compression.

### 16.3 Background Job Processing (BullMQ & Redis)
- **Asynchronous Worker Tasks**: Dedicated BullMQ job queues running on Redis offload heavy computation: Multi-channel notifications (SMTP Email & WhatsApp API), SLA automated reminders, daily analytical aggregations, PDF hospital investigation report generation, and automated database backup verifications.

### 16.4 CI/CD Pipeline & Blue-Green Deployment
- **GitHub Actions Pipeline**: Automated sequence on developer commit: `ESLint Check` $\rightarrow$ `TypeScript Type Validation` $\rightarrow$ `Unit & Integration Tests` $\rightarrow$ `Frontend Vite Build` $\rightarrow$ `Backend Build` $\rightarrow$ `Docker Multi-Stage Image Generation` $\rightarrow$ Automated Staging/Production Deployment.
- **Blue-Green Deployment Strategy**: Eliminates application downtime during hospital production upgrades and supports instantaneous rollback on anomaly detection.

### 16.5 Disaster Recovery, Sizing & Health Endpoints
- **Server Hardware Allocation**: Medium/Large Hospital production benchmark: 8 to 16 vCPUs, 16 to 32 GB RAM, and 250 to 500+ GB NVMe SSD storage.
- **Health Probes**: Kubernetes/Docker probes exposed at `/health`, `/ready`, and `/live` verifying live database connectivity, Redis pool availability, and R2 object storage reachability.

### 16.6 Enterprise Deployment Recommendations
1. **Multi-Environment Isolation**: Maintaining complete physical separation between Development, Testing, Staging, and Production environments.
2. **Database Connection Pooling (PgBouncer)**: Layering PgBouncer upstream of PostgreSQL to gracefully handle concurrent clinical peak traffic.
3. **Stateless Horizontal Scaling**: Ensuring Node.js API pods remain 100% stateless so horizontal autoscaling can trigger seamlessly under high emergency incident volumes.

---

## Chapter 17 – Testing Strategy & Quality Assurance

### 17.1 Testing Pyramid & Core Quality Objectives
HIMS enforces rigorous multi-level testing across the SDLC to verify hospital workflow correctness, strict RBAC security boundaries, SLA reliability, and regulatory auditability.
```
Requirements $\rightarrow$ Unit Testing $\rightarrow$ Integration Testing $\rightarrow$ API Testing $\rightarrow$ UI Testing $\rightarrow$ Security Testing $\rightarrow$ Performance Testing $\rightarrow$ UAT $\rightarrow$ Production
```

### 17.2 Scope & Recommended Test Automation Tooling
- **Unit & Component Testing**: Backend unit testing via Vitest / Jest covering controllers, services, validation schemas, auth logic, and notification triggers. Frontend testing via Vitest + React Testing Library targeting components, custom hooks, and Zustand state stores.
- **Integration & REST API Testing**: Cross-module verification verifying seamless data flow across `Employee $\rightarrow$ HOD $\rightarrow$ IMC $\rightarrow$ Investigator $\rightarrow$ Management $\rightarrow$ Training $\rightarrow$ Closure`. API endpoint testing via Postman, Newman, or Bruno verifying Zod schemas, filtering, pagination, and multi-part file uploads.
- **End-to-End UI Testing**: Playwright or Cypress automating navigation workflows, responsive layouts, accessibility compliance, and dynamic dark/light hospital themes.

### 17.3 Security, Performance & Storage Testing Scenarios
- **Security Scenarios**: Automated scanning via OWASP ZAP and `npm audit` verifying JWT expiration, RBAC authorization boundaries, file extension restrictions, SQL injection immunity, and XSS sanitization.
- **Performance Benchmarks (k6 / JMeter)**: Simulating 500 concurrent user logins, 100 simultaneous incident reports, 500 simultaneous analytical dashboard loads, and 50 concurrent PDF report generations at a sustained throughput of 500 notifications/minute.
- **Database & Cloudflare R2 Testing**: Verifying PostgreSQL foreign key constraints, cascade rules, soft-delete behavior (`deleted_at`), and time-limited signed URL expirations in Cloudflare R2.

### 17.4 SLA, Regression, UAT & Test Coverage Targets
- **Coverage Benchmarks**:
  - *Critical Business Logic*: **100%**
  - *Utility Functions*: $\ge$ **95%**
  - *Backend Services*: $\ge$ **90%**
  - *API Routes*: $\ge$ **85%**
  - *Frontend Components*: $\ge$ **80%**
- **User Acceptance Testing (UAT)**: Multi-stakeholder validation across Employees, HODs, IMC Committee members, Executive Management, and System Administrators ensuring intuitive operational ergonomics.
- **Defect Lifecycle**: Enforces structured tracking (`New` $\rightarrow$ `Assigned` $\rightarrow$ `In Progress` $\rightarrow$ `Fixed` $\rightarrow$ `Retested` $\rightarrow$ `Closed`) with strict production exit criteria.

### 17.5 Functional Compliance Requirements Table
| ID | Requirement Description |
| :--- | :--- |
| **TEST-001 to 004** | Execute unit, cross-module integration, API schema, and E2E UI automation testing. |
| **TEST-005 to 007** | Validate OWASP ZAP security hardening, load test 500 concurrent users, and execute UAT sign-offs. |
| **TEST-008 to 010** | Perform mandatory post-release regression suites, DB backup restoration tests, and production smoke checks. |

### 17.6 Enterprise QA Recommendations
1. **Automated CI Quality Gates**: Automatically blocking PR merges on lint, type-check, unit test, or API test failures within GitHub Actions.
2. **End-to-End Workflow Automation**: Automated Playwright scripts verifying the full 7-stage incident lifecycle (`Employee $\rightarrow$ Closure`) on every build.
3. **Visual Regression Testing**: Capturing pixel-level layout snapshots across dashboard and report screens to prevent UI drift.
4. **Production Smoke Testing**: Post-deployment automated health check suites verifying live login, database reachability, and notification delivery before traffic cutover.
5. **Anonymized Test Data Management**: Maintaining synthetic sample datasets representing departments and clinical incidents to ensure GDPR/DPDP patient privacy compliance.
