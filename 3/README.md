# Sober Path — Netlify + Firebase

A static web app for a 364-lesson addiction-recovery content roadmap.

## What is included
- Google login with Firebase Authentication
- Personal sobriety timer stored in Firestore
- Reset timer
- 364 lessons loaded from `lessons.json`
- Roadmap order + original playlist/video number
- Arabic title + YouTube URL
- Per-user lesson checkmarks stored in Firestore
- PDF button for each lesson, using Firebase Storage paths `lessons/001.pdf` ... `lessons/364.pdf`
- Search and phase filter
- Responsive RTL Arabic UI
- Netlify-ready static deployment

## 1. Create Firebase project
Create a Firebase project, then enable:
- Authentication -> Sign-in method -> Google
- Firestore Database
- Storage

Add your Netlify domain under Authentication -> Settings -> Authorized domains.

## 2. Add Firebase web config
Open `public/firebase-config.js` and replace the placeholders with the Web App config from Firebase Console.

The Firebase Web config is client-side configuration; security is enforced by Firestore/Storage rules.

## 3. Security rules
Paste `firestore.rules` into Firestore Rules.
Paste `storage.rules` into Storage Rules.

These rules make each user able to read/write only their own profile/progress. PDFs are readable by authenticated users and cannot be written from the browser.

## 4. Upload PDFs
In Firebase Storage, create a `lessons` folder and upload:
- 001.pdf
- 002.pdf
- ...
- 364.pdf

The app maps roadmap lesson 1 to `lessons/001.pdf`, etc.

## 5. Deploy to Netlify
You can deploy this as a static site:
- Netlify -> Add new site -> Deploy manually
- Upload the contents of the `public` folder

Or connect the repository to Netlify with:
- Build command: none
- Publish directory: `public`

## Important
The roadmap is an educational content sequence based on video titles. It is not a substitute for professional addiction treatment. For someone at risk of dangerous withdrawal (especially from alcohol or certain drugs), stopping suddenly can be medically dangerous and professional medical help is appropriate.
