import { handler as qrHandler } from '../lambda/qr-handler/index.js';

const QR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('POST /v1/qr cumple contrato HTTP local para solicitud válida', async () => {
  const event = createPostQrEvent({
    amount: 120.5,
    currency: 'PEN',
    description: 'Contrato HTTP local',
    ttlMinutes: 45,
  });

  const response = await qrHandler(event);
  const body = JSON.parse(response.body) as {
    qrCode: {
      amount: number;
      currency: string;
      description: string;
      expiresAt: string;
      qrData: string;
      qrId: string;
      used: boolean;
      userId: string;
    };
  };

  expect(response.statusCode).toBe(201);
  expect(response.headers['Content-Type']).toBe('application/json');
  expect(body.qrCode.qrId).toMatch(QR_ID_PATTERN);
  expect(body.qrCode).toEqual(
    expect.objectContaining({
      amount: 120.5,
      currency: 'PEN',
      description: 'Contrato HTTP local',
      qrData: `yapepay://qr/${body.qrCode.qrId}`,
      used: false,
      userId: '00000000-0000-4000-8000-000000000001',
    }),
  );
  expect(Date.parse(body.qrCode.expiresAt)).not.toBeNaN();
});

test('POST /v1/qr cumple contrato HTTP local para validación fallida', async () => {
  const event = createPostQrEvent({
    amount: -1,
    currency: 'pen',
  });

  const response = await qrHandler(event);
  const body = JSON.parse(response.body) as {
    details: string[];
    error: string;
    message: string;
  };

  expect(response.statusCode).toBe(400);
  expect(response.headers['Content-Type']).toBe('application/json');
  expect(body.error).toBe('ValidationException');
  expect(body.message).toBe('El payload de generación de QR no es válido.');
  expect(body.details).toEqual([
    'amount debe ser un número entre 1 y 999999.',
    'currency debe ser un código ISO de 3 letras mayúsculas.',
  ]);
});

function createPostQrEvent(body: unknown) {
  return {
    version: '2.0',
    routeKey: 'POST /v1/qr',
    rawPath: '/v1/qr',
    headers: {
      'content-type': 'application/json',
    },
    requestContext: {
      http: {
        method: 'POST',
        path: '/v1/qr',
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}
