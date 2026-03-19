export class GfApiUnavailableError extends Error {
  constructor() {
    super('Гаранционен фонд API не е достъпен');
    this.name = 'GfApiUnavailableError';
  }
}
