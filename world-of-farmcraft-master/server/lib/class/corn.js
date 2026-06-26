import { getLevel, getQuality } from './crop-utils.js';

class Corn {
  constructor(data) {
    this.type = 'corn';
    this.drawX = 0;
    this.drawY = -41;
    this.maturated = data?.maturated;
    this.level = getLevel(data?.health, data?.maturity);
    this.quality = getQuality(data?.health);
  }
}

export default Corn;
