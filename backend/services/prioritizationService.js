function calculatePriorityScore({ statusSite, reviews, contacted }) {
  if (contacted) {
    return 0;
  }

  const parsedReviews = Number(reviews || 0);
  let score = 0;

  if (statusSite === 'sem_site') {
    score += 100;
  } else if (statusSite === 'site_fraco') {
    score += 70;
  } else {
    score += 35;
  }

  if (parsedReviews <= 5) {
    score += 20;
  } else if (parsedReviews <= 20) {
    score += 10;
  }

  return score;
}

function hasPossibleNoWebsiteSignals(website) {
  if (!website || !website.trim()) {
    return true;
  }

  const normalized = website.toLowerCase();
  return /(instagram\.com|facebook\.com|wa\.me|linktr\.ee)/.test(normalized);
}

module.exports = {
  calculatePriorityScore,
  hasPossibleNoWebsiteSignals,
};
