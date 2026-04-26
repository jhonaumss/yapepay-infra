import { randomUUID } from 'node:crypto';

interface ApiResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

interface ApiGatewayEvent {
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

interface GenerateQrInput {
  readonly amount?: number | null;
  readonly currency?: string;
  readonly description?: string;
  readonly ttlMinutes?: number;
}

interface QrCode {
  readonly qrId: string;
  readonly userId: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly description?: string;
  readonly qrData: string;
  readonly expiresAt: string;
  readonly used: false;
}

interface GenerateQrOutput {
  readonly qrCode: QrCode;
}

interface ValidationResult {
  readonly errors: readonly string[];
  readonly input?: GenerateQrInput;
}

export const handler = async (event: ApiGatewayEvent = {}): Promise<ApiResponse> => {
  const validation = parseAndValidateInput(event);

  if (validation.errors.length > 0) {
    return jsonResponse(400, {
      error: 'ValidationException',
      message: 'El payload de generación de QR no es válido.',
      details: validation.errors,
    });
  }

  return jsonResponse(201, createGenerateQrOutput(validation.input ?? {}));
};

function createGenerateQrOutput(input: GenerateQrInput): GenerateQrOutput {
  const qrId = randomUUID();
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000).toISOString();

  const qrCode: QrCode = {
    qrId,
    userId: '00000000-0000-4000-8000-000000000001',
    ...(input.amount !== undefined && input.amount !== null ? { amount: input.amount } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    qrData: `yapepay://qr/${qrId}`,
    expiresAt,
    used: false,
  };

  return { qrCode };
}

function parseAndValidateInput(event: ApiGatewayEvent): ValidationResult {
  const errors: string[] = [];
  const rawBody = decodeBody(event);

  if (rawBody.trim() === '') {
    return { errors, input: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      errors: ['body debe ser un JSON válido.'],
    };
  }

  if (!isRecord(parsed)) {
    return {
      errors: ['body debe ser un objeto JSON.'],
    };
  }

  validateAmount(parsed.amount, errors);
  validateCurrency(parsed.currency, errors);
  validateDescription(parsed.description, errors);
  validateTtlMinutes(parsed.ttlMinutes, errors);

  return {
    errors,
    input: parsed as GenerateQrInput,
  };
}

function decodeBody(event: ApiGatewayEvent): string {
  if (event.body === undefined || event.body === null) {
    return '';
  }

  if (event.isBase64Encoded === true) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }

  return event.body;
}

function validateAmount(value: unknown, errors: string[]): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 999999) {
    errors.push('amount debe ser un número entre 1 y 999999.');
  }
}

function validateCurrency(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    errors.push('currency debe ser un código ISO de 3 letras mayúsculas.');
  }
}

function validateDescription(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' || value.length > 200) {
    errors.push('description debe ser texto de máximo 200 caracteres.');
  }
}

function validateTtlMinutes(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1440) {
    errors.push('ttlMinutes debe ser un entero entre 1 y 1440.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonResponse(statusCode: number, payload: unknown): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}
