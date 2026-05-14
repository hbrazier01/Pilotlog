# PilotLog

PilotLog is a next-generation aviation logbook and pilot identity platform built on Midnight.

The platform combines:

* digital flight logging
* pilot progression tracking
* aircraft-linked records
* Midnames identity integration
* verifiable aviation data

PilotLog transforms fragmented aviation records into structured, portable, and verifiable digital identity.

---

# Live Demo

Production deployment:

https://pilotlog-production-6c21.up.railway.app/

GitHub repository:

https://github.com/hbrazier01/Pilotlog

---

# Core Features

## Pilot Identity

* Midnight wallet connection
* Midnames `.night` identity resolution
* Canonical pilot identity system
* Persistent Pilot Passport profile

## Flight Logging

* Structured flight entries
* Aircraft-linked flight history
* FAA progression tracking
* Flight readiness calculations

## Verification

* Midnight-powered proof infrastructure
* Verifiable aviation submissions
* Chain-linked flight records
* Request verification workflow

## Dashboard

* Pilot progression tracking
* FAA requirement monitoring
* Aircraft utilization overview
* Recent flight activity

---

# Pilot Passport

Pilot Passport acts as the identity layer of PilotLog.

Features include:

* verified pilot identity
* Midnames integration
* portable pilot profile
* progression tracking
* future attestations and certifications

Example identity:

`hbrazier.night`

---

# Midnight Integration

PilotLog integrates directly with the Midnight ecosystem:

* Midnight Compact contracts
* Midnight browser SDK
* 1AM wallet integration
* Midnames identity resolution
* Zero-knowledge proof infrastructure

---

# Tech Stack

* Node.js
* Express
* Midnight SDK
* Compact smart contracts
* Railway deployment
* Vanilla JavaScript frontend

---

# Local Development

## Requirements

* Node.js 22+
* npm
* Google Chrome
* 1AM Wallet extension
* Midnight PreProd network access

---

## Clone Repository

```bash
git clone https://github.com/hbrazier01/Pilotlog.git
cd Pilotlog
```

---

## Install Dependencies

```bash
npm install
```

---

## Start Local Server

```bash
node pilotlog-cli/src/readApi.mjs
```

Local app:

```text
http://localhost:8788
```

---

# Wallet Connection

1. Install the 1AM Wallet browser extension
2. Switch wallet network to Midnight PreProd
3. Open PilotLog locally or in production
4. Click Connect Wallet
5. Approve wallet connection

---

# Current Product Direction

PilotLog is evolving from a simple aviation logbook into a verifiable aviation identity and record platform.

Long-term vision includes:

* portable pilot identity
* verifiable flight history
* aviation attestations
* aircraft record verification
* privacy-preserving aviation data
* resale-ready aircraft history

---

# Status

PilotLog is currently under active development on Midnight PreProd.
