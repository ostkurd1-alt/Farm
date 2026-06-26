class Tile {
  constructor(mapX, mapY, x, y, humidity, fertility, element, ownership) {
    this.type = 'tile';
    this.mapX = mapX;
    this.mapY = mapY;
    this.x = x;
    this.y = y;
    this.humidity = humidity;
    this.fertility = fertility;
    this.element = element;
    this.ownership = ownership;
  }
}

export default Tile;
