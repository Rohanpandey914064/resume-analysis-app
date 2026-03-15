import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, orderBy, limit, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// Global variables for Firebase
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof _firebase_config !== 'undefined' ? JSON.parse(_firebase_config) : {
    apiKey: "AIzaSyCUU53qI5ZlbgHKHkDeyWwI_RoIkuUZcsE",
    authDomain: "smart-recruitment-app.firebaseapp.com",
    projectId: "smart-recruitment-app",
    storageBucket: "smart-recruitment-app.firebasestorage.app",
    messagingSenderId: "973069698343",
    appId: "1:973069698343:web:2371f42b02bd556e8e1502",
    measurementId: "G-7RV7MTNKBF"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// You must provide your Gemini API Key here for resume scoring to work
const API_KEY = ""; // Paste your API key here

// Initialize Firebase
let app, db, auth;
let userId = null;
let isAuthReady = false;
    
// UI elements
const landingView = document.getElementById('landingView');
const companyView = document.getElementById('companyView');
const candidateView = document.getElementById('candidateView');
const showLandingBtn = document.getElementById('showLandingBtn');
const showCompanyBtn = document.getElementById('showCompanyBtn');
const showCandidateBtn = document.getElementById('showCandidateBtn');
const postJobForm = document.getElementById('postJobForm');
const companyJobsList = document.getElementById('companyJobsList');
const candidateJobsList = document.getElementById('candidateJobsList');
const applicationModal = document.getElementById('applicationModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const resumeModal = document.getElementById('resumeModal');
const closeResumeModalBtn = document.getElementById('closeResumeModalBtn');
const applyForm = document.getElementById('applyForm');
const modalJobTitle = document.getElementById('modalJobTitle');
const applyJobTitle = document.getElementById('applyJobTitle');
const applicationsContainer = document.getElementById('applicationsContainer');
const loadingSpinner = document.getElementById('loading');
const userIdDisplay = document.getElementById('userIdDisplay');
    
let currentJobIdToApply = null;

// --- Firebase Initialization and Auth ---
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    getAnalytics(app); // Initialize analytics
    setLogLevel('debug');
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
    } else {
        try {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
        } catch (error) {
            console.error("Firebase auth failed:", error);
        }
    }
    if (userId) {
        userIdDisplay.textContent = userId;
        isAuthReady = true;
        listenForJobs();
        listenForApplications();
    }
});

// --- View Management ---
function showView(view) {
    const views = [landingView, companyView, candidateView, applicationModal, resumeModal];
    views.forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
    if (view === applicationModal || view === resumeModal) {
         // Do not hide other views
    } else {
         document.querySelectorAll('#app-content > div').forEach(v => v.classList.add('hidden'));
         view.classList.remove('hidden');
    }
}
showView(landingView);

showLandingBtn.addEventListener('click', () => showView(landingView));
showCompanyBtn.addEventListener('click', () => showView(companyView));
showCandidateBtn.addEventListener('click', () => showView(candidateView));
closeModalBtn.addEventListener('click', () => showView(companyView));
closeResumeModalBtn.addEventListener('click', () => showView(candidateView));

// --- Firestore Listeners ---
function listenForJobs() {
    if (!isAuthReady) return;
    const jobsCollectionRef = collection(db, `artifacts/${appId}/public/data/jobs`);
    onSnapshot(jobsCollectionRef, (snapshot) => {
        const allJobs = []; // Array to hold all jobs for candidate view
        const companyJobs = []; // Array to hold only jobs posted by the current user
        
        snapshot.forEach(doc => {
            const job = { id: doc.id, ...doc.data() };
            allJobs.push(job); 
            
            if (job.ownerId === userId) {
                companyJobs.push(job); 
            }
        });
        
        renderCompanyJobs(companyJobs);
        renderCandidateJobs(allJobs); // Pass ALL jobs to the candidate view
    });
}

function listenForApplications() {
    if (!isAuthReady) return;
    const applicationsCollectionRef = collection(db, `artifacts/${appId}/public/data/applications`);
    onSnapshot(applicationsCollectionRef, (snapshot) => {
        const modalJobId = applicationModal.dataset.jobId;
        if (modalJobId) {
            const applications = [];
            snapshot.forEach(doc => {
                const app = { id: doc.id, ...doc.data() };
                if (app.jobId === modalJobId) {
                    applications.push(app);
                }
            });
            renderApplicationsForJob(applications);
        }
    });
}

// --- Job Posting (Updated to include 5 new fields) ---
postJobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jobTitle = postJobForm.jobTitle.value;
    const jobExperience = postJobForm.jobExperience.value;
    const jobSkills = postJobForm.jobSkills.value;
    const jobEducation = postJobForm.jobEducation.value;
    const jobType = postJobForm.jobType.value; // NEW
    
    // Get selected radio button value for Work Preference
    const jobPreference = document.querySelector('input[name="jobPreference"]:checked')?.value || '';
    
    const jobDescription = postJobForm.jobDescription.value;
    
    // Check if all fields are present (including the new ones)
    if (!jobTitle || !jobDescription || !jobExperience || !jobSkills || !jobEducation || !jobPreference || !jobType) {
        alert("Please fill out all job requirement fields.");
        return;
    }

    try {
        const jobsCollectionRef = collection(db, `artifacts/${appId}/public/data/jobs`);
        await addDoc(jobsCollectionRef, {
            title: jobTitle,
            description: jobDescription,
            // NEW FIELDS ADDED TO FIRESTORE
            requiredExperience: parseInt(jobExperience, 10),
            requiredSkills: jobSkills,
            requiredEducation: jobEducation,
            requiredJobType: jobType,
            requiredPreference: jobPreference,
            
            ownerId: userId,
            createdAt: serverTimestamp()
        });
        postJobForm.reset();
    } catch (error) {
        console.error("Error posting job: ", error);
    }
});

// --- Delete Job Function ---
async function deleteJob(jobId) {
    if (!confirm("Are you sure you want to delete this job? All associated applications will be removed.")) {
        return;
    }

    try {
        loadingSpinner.classList.remove('hidden');
        const jobDocRef = doc(db, `artifacts/${appId}/public/data/jobs`, jobId);
        
        const applicationsRef = collection(db, `artifacts/${appId}/public/data/applications`);
        const q = query(applicationsRef, where("jobId", "==", jobId));
        const querySnapshot = await getDocs(q);
        const deletePromises = querySnapshot.docs.map(appDoc => deleteDoc(doc(db, `artifacts/${appId}/public/data/applications`, appDoc.id)));
        await Promise.all(deletePromises);

        await deleteDoc(jobDocRef);
        console.log("Job and associated applications deleted successfully!");
    } catch (error) {
        console.error("Error deleting job: ", error);
        alert("Error deleting job. Check Firebase rules or console for details.");
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// --- Delete Application Function ---
async function deleteApplication(applicationId) {
    try {
        loadingSpinner.classList.remove('hidden');
        const appDocRef = doc(db, `artifacts/${appId}/public/data/applications`, applicationId);
        
        await deleteDoc(appDocRef);
        console.log("Application deleted successfully!");
    } catch (error) {
        console.error("Error deleting application: ", error);
        alert("Error deleting application. Check Firebase rules or console for details.");
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}


// --- Resume Submission & Scoring (Updated to use 5 new fields) ---
applyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loadingSpinner.classList.remove('hidden');

    const candidateName = applyForm.candidateName.value;
    const resumeContent = applyForm.resumeContent.value;
    
    const jobId = currentJobIdToApply;
    const jobDocRef = doc(db, `artifacts/${appId}/public/data/jobs`, jobId);
    
    try {
        const jobDoc = await getDoc(jobDocRef);
        const jobData = jobDoc.data();
        
        // Extract ALL structured requirements
        const jobDescription = jobData.description;
        const requiredExperience = jobData.requiredExperience || 0;
        const requiredSkills = jobData.requiredSkills || 'N/A';
        const requiredEducation = jobData.requiredEducation || 'N/A';
        const requiredJobType = jobData.requiredJobType || 'N/A';
        const requiredPreference = jobData.requiredPreference || 'N/A';
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
        
        // UPDATED PROMPT: Now includes all five structured requirements for better scoring
        const prompt = `You are an expert recruitment analyst. Given a job description and a resume, your task is to provide a relevance score (0-100) and a brief summary of how well the resume matches the job. Your response MUST be a single JSON object with the properties 'score' (number) and 'summary' (string).

        Structured Job Requirements:
        - Required Experience: ${requiredExperience} years
        - Must-Have Skills: ${requiredSkills}
        - Required Education: ${requiredEducation}
        - Required Job Type: ${requiredJobType}
        - Work Preference: ${requiredPreference}

        Detailed Job Description: "${jobDescription}"
        Resume: "${resumeContent}"`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "score": { "type": "NUMBER" },
                        "summary": { "type": "STRING" }
                    },
                    "propertyOrdering": ["score", "summary"]
                }
            }
        };
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        let scoreData = { score: 0, summary: "Could not generate a score." };
        if (jsonText) {
            try {
                scoreData = JSON.parse(jsonText);
            } catch (e) {
                console.error("Failed to parse LLM response JSON:", e);
            }
        }
        
        const applicationsCollectionRef = collection(db, `artifacts/${appId}/public/data/applications`);
        await addDoc(applicationsCollectionRef, {
            jobId: jobId,
            candidateName: candidateName,
            resumeContent: resumeContent,
            score: scoreData.score,
            summary: scoreData.summary,
            appliedAt: serverTimestamp()
        });

        applyForm.reset();
        showView(candidateView);
    } catch (error) {
        console.error("Error submitting application or scoring resume: ", error);
        alert("Application failed. Check console for details.");
    } finally {
        loadingSpinner.classList.add('hidden');
    }
});

// --- UI Rendering Functions ---
function renderCompanyJobs(jobs) {
    if (jobs.length === 0) {
        companyJobsList.innerHTML = '<p class="text-gray-500 text-center font-inter">No jobs posted yet.</p>';
        return;
    }
    companyJobsList.innerHTML = '';
    jobs.forEach(job => {
        const jobCard = document.createElement('div');
        jobCard.className = 'card-item';
        jobCard.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="text-xl font-semibold text-teal-400 heading">${job.title}</h4>
                    <p class="text-gray-400 my-2 text-sm font-inter">${job.description.substring(0, 100)}...</p>
                    <p class="text-xs text-gray-500 font-inter mt-2">Posted on: ${job.createdAt?.toDate().toLocaleDateString() || 'N/A'}</p>
                </div>
                <button class="delete-btn ml-4" data-job-id="${job.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <button data-job-id="${job.id}" class="viewAppsBtn mt-4 text-sm font-semibold text-gray-900 bg-sky-400 py-2 px-4 rounded-lg card-btn hover:bg-sky-500 font-inter">View Applicants</button>
        `;
        companyJobsList.appendChild(jobCard);
    });
    document.querySelectorAll('.viewAppsBtn').forEach(button => {
        button.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobId;
            const jobTitle = jobs.find(job => job.id === jobId)?.title;
            if (jobId && jobTitle) {
                showApplications(jobId, jobTitle);
            }
        });
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const jobId = e.target.closest('button').dataset.jobId;
            if (jobId) {
                deleteJob(jobId);
            }
        });
    });
}

function renderCandidateJobs(jobs) {
    if (jobs.length === 0) {
        candidateJobsList.innerHTML = '<p class="text-gray-500 text-center font-inter">No jobs available at the moment.</p>';
        return;
    }
    candidateJobsList.innerHTML = '';
    jobs.forEach(job => {
        const jobCard = document.createElement('div');
        jobCard.className = 'card-item';
        jobCard.innerHTML = `
            <h4 class="text-xl font-semibold text-teal-400 heading">${job.title}</h4>
            <p class="text-gray-400 my-2 text-sm font-inter">${job.description.substring(0, 200)}...</p>
            <div class="mt-4 flex space-x-3">
                <button data-job-id="${job.id}" data-job-title="${job.title}" class="applyBtn text-sm font-semibold text-gray-900 bg-green-400 py-2 px-4 rounded-lg card-btn hover:bg-green-500 font-inter">Apply Now</button>
                
                <button data-job-id="${job.id}" class="deleteJobBtn text-sm font-semibold delete-btn">
                    <i class="fas fa-trash"></i> Delete Job
                </button>
            </div>
        `;
        candidateJobsList.appendChild(jobCard);
    });

    document.querySelectorAll('.applyBtn').forEach(button => {
        button.addEventListener('click', (e) => {
            currentJobIdToApply = e.target.dataset.jobId;
            const jobTitle = e.target.dataset.jobTitle;
            applyJobTitle.textContent = jobTitle;
            showView(resumeModal);
        });
    });
    
    // NEW EVENT LISTENER for the Delete Job Button
    document.querySelectorAll('.deleteJobBtn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); 
            const jobId = e.target.closest('button').dataset.jobId;
            if (jobId) {
                deleteJob(jobId);
            }
        });
    });
}

function showApplications(jobId, jobTitle) {
    modalJobTitle.textContent = jobTitle;
    applicationModal.dataset.jobId = jobId;
    showView(applicationModal);
    
    const applicationsCollectionRef = collection(db, `artifacts/${appId}/public/data/applications`);
    const q = query(applicationsCollectionRef, where("jobId", "==", jobId));
    
    onSnapshot(q, (snapshot) => {
        const applications = [];
        snapshot.forEach(doc => applications.push({ id: doc.id, ...doc.data() }));
        renderApplicationsForJob(applications);
    });
}

function renderApplicationsForJob(applications) {
    if (applications.length === 0) {
        applicationsContainer.innerHTML = '<p class="text-gray-500 text-center font-inter">No applicants for this job yet.</p>';
        return;
    }
    applicationsContainer.innerHTML = '';
    applications.sort((a, b) => b.score - a.score);
    
    applications.forEach(app => {
        const appCard = document.createElement('div');
        appCard.className = 'card-item mb-4';
        appCard.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h5 class="text-xl font-semibold text-white font-inter">${app.candidateName}</h5>
                <div class="score-badge text-sm ${app.score > 75 ? 'score-green' : app.score > 50 ? 'score-yellow' : 'score-red'}">
                    Score: ${app.score || 0}%
                </div>
            </div>
            <p class="text-gray-400 text-sm font-inter"><strong>Summary:</strong> ${app.summary}</p>
            <p class="text-gray-500 text-xs font-inter mt-2">Applied on: ${app.appliedAt?.toDate().toLocaleDateString() || 'N/A'}</p>
            
            <button data-app-id="${app.id}" class="deleteAppBtn mt-4 text-sm font-semibold delete-btn">
                <i class="fas fa-trash-alt mr-1"></i> Delete Application
            </button>
        `;
        applicationsContainer.appendChild(appCard);
    });

    // Event Listener for Delete Application Button
    document.querySelectorAll('.deleteAppBtn').forEach(button => {
        button.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('button.deleteAppBtn');
            const appId = deleteButton.dataset.appId;
            
            if (appId && confirm("Are you sure you want to delete this application?")) {
                deleteApplication(appId);
            }
        });
    });
}

// Initial render based on existing jobs and applications
listenForJobs();
