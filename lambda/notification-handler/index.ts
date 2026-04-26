interface SqsRecord {
  readonly body: string;
  readonly messageId?: string;
}

interface SqsEvent {
  readonly Records?: readonly SqsRecord[];
}

interface NotificationHandlerResult {
  readonly status: 'OK';
  readonly message: string;
  readonly processedRecords: number;
}

export const handler = async (event: SqsEvent): Promise<NotificationHandlerResult> => {
  const records = event.Records ?? [];

  console.log('Evento recibido por Notification Service:', JSON.stringify(event));

  for (const record of records) {
    console.log('Procesando mensaje:', record.body);
  }

  return {
    status: 'OK',
    message: 'Notificaciones procesadas correctamente',
    processedRecords: records.length,
  };
};
