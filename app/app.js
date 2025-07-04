// --- CONFIG ---
const GITHUB_JSON_URL = './gigachads-ranking.json'; // Change en raw.githubusercontent pour démo prod

// DEMO (à étendre, tout sera dynamique après test)
const mockCard = {
    reviewer: "mxbely",
    reviewed: "guezit0",
    time: "2h",
    comment: "Guezit is a giga innovator.",
    avatar: "https://ui-avatars.com/api/?name=Mxbely"
};

document.addEventListener('DOMContentLoaded', () => {
    // Demo widget rendering
    const reviewsList = document.getElementById('latestReviews');
    reviewsList.innerHTML = createReviewCard(mockCard);

    // (Loader le vrai JSON bientôt)
    // fetchAndRenderLeaderboard();
});

function createReviewCard(card) {
    return `
        <div class="widget-card">
            <img src="${card.avatar}" alt="" />
            <div class="widget-card-details">
                <div class="widget-card-title">${card.reviewer} reviewed ${card.reviewed}</div>
                <div class="widget-card-meta">${card.comment}</div>
            </div>
            <span class="widget-card-meta">${card.time} ago</span>
        </div>
    `;
}
