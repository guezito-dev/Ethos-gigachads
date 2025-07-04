const DEBUG_MODE = true;
const MAX_ITEMS = 5;
const GITHUB_JSON_URL = 'https://raw.githubusercontent.com/guezito-dev/gigachads/main/Ethos/gigachads-ranking.json';

let gigachadsData = null;
const processedActivities = new Set();

function debug(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`[REVIEWS] ${message}`, data);
    }
}

// ========== Utils ==========

// Formatage du temps en style "2h ago"
function formatTimeAgo(timestamp) {
    let t = parseInt(timestamp, 10);
    if (t < 1e12) t = t * 1000;
    const now = Date.now();
    const diff = Math.floor((now - t) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
}

function showError(message, details = null) {
    console.error('[ERROR]', message, details);
    document.getElementById('loading').style.display = 'none';
    const errorEl = document.getElementById('error');
    errorEl.style.display = 'block';
    errorEl.innerHTML = `<div class="error">${message}</div>`;
}

// ========== Activity Parsing ==========

function getReviewTitle(activity) {
    if (activity.content?.title) return activity.content.title;
    if (activity.content?.comment) return activity.content.comment;
    if (activity.content?.text) return activity.content.text;
    const subjectName = activity.subjectUser?.displayName || activity.subjectUser?.username || 'User';
    return `Review for ${subjectName}`;
}

function getReviewDescription(activity) {
    if (activity.content?.description) return activity.content.description;
    if (activity.translatedDescription) return activity.translatedDescription;
    if (activity.description) return activity.description;
    return '';
}

function createUniqueId(activity) {
    const authorId = activity.author?.profileId || activity.authorUser?.profileId;
    const subjectId = activity.subject?.profileId || activity.subjectUser?.profileId;
    const timestamp = activity.createdAt || activity.timestamp;
    const type = activity.type;
    return `${type}-${authorId}-${subjectId}-${timestamp}`;
}

async function fetchUserActivities(userkey) {
    debug(`Fetching activities for ${userkey}`);
    try {
        const response = await fetch('https://api.ethos.network/api/v2/activities/profile/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                userkey: userkey,
                excludeHistorical: false,
                limit: 50,
                offset: 0
            })
        });

        if (response.ok) {
            const data = await response.json();
            return {
                activities: data.values || [],
                total: data.total || 0
            };
        } else {
            return { activities: [], total: 0 };
        }
    } catch (error) {
        return { activities: [], total: 0 };
    }
}

// ========== Main Fetch Logic ==========

async function fetchRecentReviews() {
    debug('Starting reviews fetch...');
    if (!gigachadsData || !gigachadsData.ranking) {
        throw new Error('Giga Chads data not available');
    }

    const allReviews = [];
    const gigachadProfileIds = new Set(gigachadsData.ranking.map(u => u.user.profileId));
    const profileIdToUser = new Map(gigachadsData.ranking.map(u => [u.user.profileId, u.user]));
    processedActivities.clear();

    debug('Giga Chads detected', { count: gigachadProfileIds.size });
    const usersToCheck = gigachadsData.ranking.slice(0, 10);

    for (const userRank of usersToCheck) {
        try {
            const userkey = `profileId:${userRank.user.profileId}`;
            const result = await fetchUserActivities(userkey);

            if (result.activities.length > 0) {
                result.activities.forEach(activity => {
                    const authorProfileId = activity.author?.profileId;
                    const subjectProfileId = activity.subject?.profileId;
                    if (activity.type === 'review' && authorProfileId && subjectProfileId) {
                        const uniqueId = createUniqueId(activity);

                        if (!processedActivities.has(uniqueId)) {
                            processedActivities.add(uniqueId);

                            if (gigachadProfileIds.has(subjectProfileId) &&
                                gigachadProfileIds.has(authorProfileId) &&
                                authorProfileId !== subjectProfileId) {

                                const subjectUser = profileIdToUser.get(subjectProfileId);
                                const authorUser = profileIdToUser.get(authorProfileId);

                                if (subjectUser && authorUser) {
                                    debug(`✅ Unique review: ${authorUser.username} -> ${subjectUser.username}`);
                                    allReviews.push({
                                        ...activity,
                                        authorUser: authorUser,
                                        subjectUser: subjectUser,
                                        uniqueId: uniqueId
                                    });
                                }
                            }
                        }
                    }
                });
            }

        } catch (error) {
            debug(`Error for ${userRank.user.username}:`, error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    allReviews.sort((a, b) =>
        new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp)
    );
    debug('Total reviews fetched (no duplicates)', { count: allReviews.length });
    return allReviews.slice(0, MAX_ITEMS);
}

// ========== Rendu HTML harmonisé ==========

function createReviewHTML(review) {
    const translatedTitle = review.translation?.translatedContent || review.comment;
    const description = getReviewDescription(review);
    const timeAgo = formatTimeAgo(review.createdAt || review.timestamp);
    const authorName = review.authorUser.displayName || review.authorUser.username;
    const subjectName = review.subjectUser.displayName || review.subjectUser.username;
    const authorAvatar = review.authorUser.avatarUrl || 'https://via.placeholder.com/46';
    const subjectAvatar = review.subjectUser.avatarUrl || 'https://via.placeholder.com/46';

    // On récupère l'id numérique de la review
    const reviewId = review.data?.id || review.content?.id;
    const url = reviewId ? `https://app.ethos.network/activity/review/${reviewId}` : "#";

    return `
    <a href="${url}" target="_blank" class="card-row review-link">
        <img class="card-avatar" src="${authorAvatar}" alt="${authorName}">
        <span class="card-arrow">→</span>
        <img class="card-avatar" src="${subjectAvatar}" alt="${subjectName}"> 
        <div class="card-content">
            <div class="card-line">
                <span class="card-user">${authorName}</span>
                <span class="card-verb">reviewed</span>
                <span class="card-user">${subjectName}</span>
                <span class="card-time">${timeAgo}</span>
            </div>
            <div class="card-title">${translatedTitle}</div>
            <div class="card-description">${description}</div>
        </div>
    </a>
    `;
}


function displayReviews(reviews) {
    const container = document.getElementById('reviewsContainer');
    if (reviews.length > 0) {
        container.innerHTML = reviews.map(createReviewHTML).join('');
    } else {
        container.innerHTML = '<div class="empty-state"><p>No recent reviews found between Giga Chads.</p></div>';
    }
}

// ========== Initialisation ==========

async function loadReviews() {
    try {
        debug('Starting reviews loading...');
        const reviews = await fetchRecentReviews();
        displayReviews(reviews);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        debug('Loading completed successfully');
    } catch (error) {
        debug('Error loading reviews', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        showError('Unable to load reviews. Check console for details.');
    }
}

async function loadFromGitHub() {
    try {
        debug('Loading from GitHub...');
        const response = await fetch(GITHUB_JSON_URL);
        if (response.ok) {
            gigachadsData = await response.json();
            debug('GitHub data loaded successfully');
            return true;
        } else {
            debug('GitHub file not found or not accessible');
            return false;
        }
    } catch (error) {
        debug('GitHub loading failed', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    debug('Initializing reviews widget...');
    const githubSuccess = await loadFromGitHub();
    if (githubSuccess) {
        await loadReviews();
    } else {
        try {
            const response = await fetch('gigachads-ranking.json');
            if (response.ok) {
                gigachadsData = await response.json();
                await loadReviews();
            } else {
                throw new Error('Local JSON file not found');
            }
        } catch (error) {
            debug('Auto-loading failed', error);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            showError('Auto-loading failed. Please check console for details.');
        }
    }
});
