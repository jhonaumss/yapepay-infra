export const handler = async (event) => {
  console.log('Evento recibido por Notification Service:', JSON.stringify(event));

  for (const record of event.Records ?? []) {
    console.log('Procesando mensaje:', record.body);
  }

  return {
    status: 'OK',
    message: 'Notificaciones procesadas correctamente',
  };
};
