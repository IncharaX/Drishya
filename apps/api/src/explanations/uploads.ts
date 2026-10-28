import { randomUUID } from "node:crypto";
import { sourceUpload } from "@drishya/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import mammoth from "mammoth";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { db } from "../database";
import { HttpError } from "../http-error";
export const uploadsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
});
uploadsRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Choose a file.");
  const extension = file.originalname.split(".").at(-1)?.toLowerCase() ?? "";
  let text = "";
  try {
    if (extension === "pdf") {
      if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new Error("Invalid PDF");
      const parser = new PDFParse({ data: file.buffer });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else if (extension === "docx") {
      // Reject oversized expanded ZIP contents before handing DOCX to the parser.
      let expanded = 0;
      for (let i = 0; i + 46 < file.buffer.length; i++) {
        if (file.buffer.readUInt32LE(i) === 0x02014b50)
          expanded += file.buffer.readUInt32LE(i + 24);
      }
      if (expanded > 32 * 1024 * 1024)
        throw new Error("Expanded file too large");
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    } else if (["txt", "md", "csv"].includes(extension ?? "")) {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
      if (text.includes("\0")) throw new Error("Binary file");
    } else
      throw new HttpError(400, "Use a PDF, DOCX, TXT, Markdown or CSV file.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "Could not read this file. Use an unencrypted text-based PDF, DOCX or UTF-8 text file. Scanned PDFs need OCR first.",
    );
  }
  text = text.replaceAll("\0", "").trim();
  if (text.length < 20)
    throw new HttpError(
      400,
      "This file contains too little readable text. Scanned documents need OCR first.",
    );
  if (text.length > 12000)
    throw new HttpError(
      400,
      "This file exceeds 12,000 extracted characters. Upload a focused section so its full content can be explained accurately.",
    );
  const [row] = await db
    .insert(sourceUpload)
    .values({
      id: randomUUID(),
      userId: res.locals.userId,
      name: file.originalname.slice(0, 200),
      mime: extension,
      size: file.size,
      text,
    })
    .returning();
  res.status(201).json({
    id: row.id,
    name: row.name,
    size: row.size,
    characters: row.text.length,
  });
});
uploadsRouter.delete("/:id", async (req, res) => {
  await db
    .delete(sourceUpload)
    .where(
      and(
        eq(sourceUpload.id, z.uuid().parse(req.params.id)),
        eq(sourceUpload.userId, res.locals.userId),
        isNull(sourceUpload.conversationId),
      ),
    );
  res.sendStatus(204);
});
