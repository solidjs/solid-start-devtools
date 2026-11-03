// Keep these values aligned with @solidjs/web/server-functions.
export const BODY_FORMAT_KEY = 'X-Server-Function-Format';

export const BODY_FORMAT_FILE_KEY = '__server_function_file__';

export const enum BodyFormat {
  Serialized = '0',
  String = '1',
  FormData = '2',
  URLSearchParams = '3',
  Blob = '4',
  File = '5',
  ArrayBuffer = '6',
  Uint8Array = '7',
  Json = '8',
}

// A `Serialized` call whose arguments hold files or blobs (`enableRichArguments`)
// goes out as multipart form data: the encoded arguments in this part, each
// file in a part of its own.
export const UPLOAD_ARGS_PART = 'args';

/** Whether the body is a `Serialized` argument list sent with its files. */
export function isUploadBody(headers: Headers): boolean {
  return (
    headers.get(BODY_FORMAT_KEY) === BodyFormat.Serialized &&
    (headers.get('Content-Type') ?? '').startsWith('multipart/form-data')
  );
}

/** The encoded arguments of an upload body, and the form without them. */
export async function splitUploadBody(
  source: Request | Response,
): Promise<{ args: string; files: FormData }> {
  const form = await source.formData();
  const args = form.get(UPLOAD_ARGS_PART);
  if (typeof args !== 'string') throw new Error('upload body has no arguments part');
  form.delete(UPLOAD_ARGS_PART);
  return { args, files: form };
}
