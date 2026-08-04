# JPHRC Incident Management System

**Jaiprakash Hospital & Research Centre, Raurkela**  
*Quality Health Care at Affordable Price*

A full-stack production-grade Incident Management System built on the PERN stack (PostgreSQL · Express · React · Node.js) using Vite + JavaScript (JSX).

---

## 📁 Project Structure

```
ims/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── api/         # Axios API client
│   │   ├── components/  # Reusable UI & layout
│   │   ├── pages/       # Page-level components
│   │   ├── store/       # Zustand auth store
│   │   └── utils/       # Helpers, formatters
│   └── dist/            # Production build
└── server/          # Express + PostgreSQL backend
    ├── config/      # DB connection pool
    ├── controllers/ # Business logic
    ├── middleware/  # Auth, audit logging
    ├── migrations/  # SQL schema
    ├── routes/      # Express routes
    └── utils/       # Notifications, reference IDs
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14

### 1. Database Setup
```bash
createdb jaiprakash_ims
psql jaiprakash_ims < server/migrations/001_schema.sql
```

### 2. Backend
```bash
cd server
cp .env.example .env      # Edit DB credentials, JWT secret, etc.
npm install
npm run dev               # Runs on http://localhost:5000
```

### 3. Frontend
```bash
cd client
cp .env.example .env      # Set VITE_API_URL
npm install
npm run dev               # Runs on http://localhost:5173
```

---

## 🔐 Roles & Access

| Role | Description |
|------|-------------|
| `employee` | Report incidents, track own submissions |
| `hod` | Review incidents for their department |
| `imc` | Claim & investigate all incidents, manage KB |
| `head_management` | Final decisions, generate reports |
| `system_admin` | Full access: users, config, analytics, audit |

**Login uses**: Full Name + Employee ID + Date of Birth  
(Validated against Office Portal API; falls back to cached DB if portal is unreachable)

---

## 📋 Key Features

### Core Incident Workflow
1. **Employee** submits incident (6-step form with duplicate detection)
2. **HOD** reviews and acknowledges (must check acknowledgment checkbox)
3. **IMC** claims (30-min lock), investigates, optionally assigns investigator
4. **Management** makes final decision and closes with report
5. **Management/IMC** can re-open incidents if required

### Special Logic
- **Grave incidents**: Parallel HOD + IMC review (configurable)
- **Duplicate detection**: Cross-references similar incidents within ±3 days
- **SLA tracking**: Flags incidents breaching 7-day resolution target
- **Claim expiry**: IMC claims auto-expire after 30 min (both configurable)
- **Withdrawal window**: Only before HOD first-views the incident

### Security
- JWT with 8h expiry
- Role-based route guards (frontend + backend)
- Full audit trail for every action
- Helmet.js security headers
- IP logging on all sensitive operations

---

## 🗃️ Database

Schema: `server/migrations/001_schema.sql`

Key tables:
- `users` — synced from Office Portal
- `incidents` — main incidents with reference IDs (`JPHRC/IMS/YYYY/NNNNN`)
- `incident_departments` — multi-department targeting
- `feedbacks` — HOD / IMC / MD feedback per stage
- `imc_claims` — claim locks with expiry
- `final_reports` — MD-generated closure reports
- `knowledge_base` — lessons-learned database
- `audit_logs` — full JSONB audit trail
- `notifications` — in-app notification system
- `system_config` — runtime-configurable settings

---

## ⚙️ Environment Variables

### Server (`server/.env`)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 64-char secret key |
| `OFFICE_PORTAL_API_URL` | Hospital employee validation API |
| `SMTP_HOST/USER/PASS` | Email notifications |
| `TWILIO_*` | WhatsApp notifications |
| `UPLOAD_DIR` | File attachment storage path |

### Client (`client/.env`)
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |

---

## 🏥 Reference ID Format

```
JPHRC/IMS/2026/00001
```
Format: `{Hospital Code}/IMS/{Year}/{5-digit sequence}`

---

## 🚢 Production Deployment

```bash
# Build frontend
cd client && npm run build

# Serve with nginx (recommended)
# Point /api → http://localhost:5000
# Point / → client/dist

# Backend with PM2
cd server
pm2 start index.js --name jphrc-ims
pm2 save && pm2 startup
```

### Recommended Stack
- **Server**: Ubuntu 22.04 LTS
- **Reverse Proxy**: Nginx
- **Process Manager**: PM2
- **Database**: PostgreSQL 16 with daily pg_dump backups
- **SSL**: Let's Encrypt (certbot)

---

## 📊 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v3 |
| State | Zustand, TanStack Query v5 |
| Charts | Recharts |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 16, node-postgres (pg) |
| Auth | JWT (jsonwebtoken) |
| Notifications | react-hot-toast |
| Icons | Lucide React |

---

*Built for 1,500+ employees across Dandiapali Main Hospital, Uditnagar City Center, and Rajgangpur City Center.*
