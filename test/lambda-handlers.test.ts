import { handler as notificationHandler } from '../lambda/notification-handler/index.js';
import { handler as qrHandler } from '../lambda/qr-handler/index.js';

test('qr-handler responde con QR demo creado para payload válido', async () => {
  const response = await qrHandler({
    body: JSON.stringify({
      amount: 25,
      currency: 'PEN',
      description: 'Cobro demo YapePay',
      ttlMinutes: 30,
    }),
  });
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
  expect(body.qrCode.qrId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(body.qrCode).toEqual(
    expect.objectContaining({
      amount: 25,
      currency: 'PEN',
      description: 'Cobro demo YapePay',
      qrData: `yapepay://qr/${body.qrCode.qrId}`,
      used: false,
      userId: '00000000-0000-4000-8000-000000000001',
    }),
  );
  expect(Date.parse(body.qrCode.expiresAt)).not.toBeNaN();
});

test('qr-handler permite QR abierto sin body', async () => {
  const response = await qrHandler();
  const body = JSON.parse(response.body) as {
    qrCode: {
      amount?: number;
      currency?: string;
      qrId: string;
    };
  };

  expect(response.statusCode).toBe(201);
  expect(body.qrCode.qrId).toEqual(expect.any(String));
  expect(body.qrCode.amount).toBeUndefined();
  expect(body.qrCode.currency).toBeUndefined();
});

test('qr-handler rechaza JSON inválido', async () => {
  const response = await qrHandler({
    body: '{invalid-json',
  });
  const body = JSON.parse(response.body) as {
    details: string[];
    error: string;
  };

  expect(response.statusCode).toBe(400);
  expect(body.error).toBe('ValidationException');
  expect(body.details).toEqual(['body debe ser un JSON válido.']);
});

test('qr-handler rechaza campos fuera del contrato mínimo', async () => {
  const response = await qrHandler({
    body: JSON.stringify({
      amount: 0,
      currency: 'pen',
      description: 'x'.repeat(201),
      ttlMinutes: 1441,
    }),
  });
  const body = JSON.parse(response.body) as {
    details: string[];
    error: string;
  };

  expect(response.statusCode).toBe(400);
  expect(body.error).toBe('ValidationException');
  expect(body.details).toEqual([
    'amount debe ser un número entre 1 y 999999.',
    'currency debe ser un código ISO de 3 letras mayúsculas.',
    'description debe ser texto de máximo 200 caracteres.',
    'ttlMinutes debe ser un entero entre 1 y 1440.',
  ]);
});

test('notification-handler procesa lote SQS sin fallar', async () => {
  const response = await notificationHandler({
    Records: [
      {
        body: JSON.stringify({ transactionId: 'tx-001' }),
        messageId: 'msg-001',
      },
      {
        body: JSON.stringify({ transactionId: 'tx-002' }),
        messageId: 'msg-002',
      },
    ],
  });

  expect(response).toEqual({
    status: 'OK',
    message: 'Notificaciones procesadas correctamente',
    processedRecords: 2,
  });
});
