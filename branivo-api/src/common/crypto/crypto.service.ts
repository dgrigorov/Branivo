import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
    );
  }
}
