# 🚀 Whiteboard App Deployment Guide

This repository has been structured as a monorepo containing both the React frontend (`client`) and the Node.js WebSocket backend (`server`), hardened for production. 

## Environment Variables
Before deploying, ensure you have the following secure environment variables ready (do not commit them!):

### Server ENV variables (`server/.env`)
* `SUPABASE_URL` (From your Supabase Project Settings)
* `SUPABASE_SERVICE_ROLE_KEY` (MUST BE SECURE. Never expose to client.)
* `PORT` (Usually set by hosting platforms automatically)
* `CLIENT_ORIGIN` (Optional. Set if hosting the client on a separate domain. E.g. `https://my-app.vercel.app`)

### Client ENV variables (`client/.env`)
* `VITE_SUPABASE_URL` 
* `VITE_SUPABASE_ANON_KEY` (Safe to be public)
* `VITE_SERVER_URL` (Only if deploying back/front *separately*. Leave blank to auto-detect if deploying as a monolithic app on a single node instance.)

---

## ☁️ Deployment Strategies

There are two primary ways you can deploy this application:

### Option 1: Monolithic Deployment (Easiest — Render, Railway, fly.io)
You can deploy the *entire* application onto a single Node.js dyno/server. The Node.js backend has been configured to serve the built React files statically.

1. Tell the hosting provider to install all dependencies:
   ```bash
   npm run install:all
   ```
2. Build the client site:
   ```bash
   npm run build
   ```
3. Start the server (which will host the socket APIs AND serve the client UI):
   ```bash
   cd server && npm start
   ```

*Note: In this mode, leave the Client `VITE_SERVER_URL` blank. The React app will automatically connect socket requests back to its own domain root.*


### Option 2: Split Deployment (Backend API + Vercel/Netlify)
If you prefer free frontend hosting tools like Vercel or Netlify, deploy them separately:

**1. Deploy Backend to Render / Railway:**
Keep `PORT` auto-mapped by the host. 
Add your frontend domain (once deployed) to the `CLIENT_ORIGIN` env variable.
* Start Command: `cd server && npm start`

**2. Deploy Frontend to Vercel / Netlify:**
Select the `client/` folder as the Root Directory.
* Build Command: `npm run build`
* Publish Directory: `dist`
* **Crucial:** You must set `VITE_SERVER_URL=https://<your-deployed-backend-url.com>` in your Vercel Environment Variables so the socket connects correctly.

---

### Security & Hardening Changes Made:
- **CORS Configured**: Secures the WebSocket connection to your explicit frontend UI origin.
- **Graceful Shutdown**: Intercepts `SIGTERM` / `SIGINT` so active websocket clients finish gracefully when your hosting platform restarts dynos.
- **Global Error Handling**: Prevents rogue unhandled promise rejections from crashing the whole server mysteriously.
- **Health Checks**: Included a `/health` endpoint for automatic uptime monitors and load balancer pings.
- **Environment Checks**: The server ensures `SUPABASE_SERVICE_ROLE_KEY` and URL are present before launching, preventing confusing silent database failures down the line. 
