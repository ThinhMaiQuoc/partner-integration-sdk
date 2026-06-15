import { Blob } from "node:buffer";
import type { DocumentRecord, UploadDocumentOptions } from "../shared/types";
import type { HttpClient } from "./http-client";

export type UploadableDocument = Blob | Buffer | Uint8Array | ArrayBuffer | string;

export class DocumentsClient {
  constructor(private readonly httpClient: HttpClient) {}

  upload(claimId: string, file: UploadableDocument, options: UploadDocumentOptions): Promise<DocumentRecord> {
    const formData = new FormData();
    const { blob, fileName } = toBlob(file, options);

    formData.set("type", options.type);
    formData.set("file", blob, fileName);

    return this.httpClient.multipart<DocumentRecord>({
      method: "POST",
      path: `/claims/${encodeURIComponent(claimId)}/documents`,
      formData
    });
  }

  async list(claimId: string): Promise<DocumentRecord[]> {
    const response = await this.httpClient.request<{ data: DocumentRecord[] }>({
      method: "GET",
      path: `/claims/${encodeURIComponent(claimId)}/documents`
    });

    return response.data;
  }
}

function toBlob(file: UploadableDocument, options: UploadDocumentOptions): { blob: Blob; fileName: string } {
  const fileName = options.fileName ?? "document.bin";
  const contentType = options.contentType ?? "application/octet-stream";

  if (file instanceof Blob) {
    return { blob: file, fileName };
  }

  if (typeof file === "string") {
    return {
      blob: new Blob([file], { type: options.contentType ?? "text/plain" }),
      fileName: options.fileName ?? "document.txt"
    };
  }

  return {
    blob: new Blob([file], { type: contentType }),
    fileName
  };
}
