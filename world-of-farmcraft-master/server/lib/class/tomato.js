import { getLevel, getQuality } from './crop-utils.js';

class Tomato {
  constructor(data) {
    this.type = 'tomato';
    this.drawX = 0;
    this.drawY = -19;
    this.maturated = data?.maturated;
    this.level = getLevel(data?.health, data?.maturity);
    this.quality = getQuality(data?.health);
  }
}

export default Tomato;
