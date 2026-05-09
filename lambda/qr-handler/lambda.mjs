// Placeholder — replaced at deploy time by yapepay-services CD pipeline.
export const handler = async () => ({
  statusCode: 501,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Not yet deployed from yapepay-services.' }),
});
