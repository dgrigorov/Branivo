export class KatApiUnavailableError extends Error {
  constructor() {
    super('KAT API не е достъпен');
    this.name = 'KatApiUnavailableError';
  }
}
