export const handler = async () => {
  return {
    statusCode: 201,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      qrId: 'demo-qr-001',
      status: 'CREATED',
      message: 'QR generado correctamente desde YapePay QR Service',
    }),
  };
};
