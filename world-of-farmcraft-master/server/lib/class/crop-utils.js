function getLevel(health, maturity) {
  if (health === 0) return 5;
  if (maturity < 10) return 0;
  if (maturity < 30) return 1;
  if (maturity < 60) return 2;
  if (maturity < 80) return 3;
  return 4;
}

function getQuality(health) {
  if (health <= 10) return 0;
  if (health <= 30) return 1;
  if (health <= 60) return 2;
  if (health <= 80) return 3;
  return 4;
}

export { getLevel, getQuality };
