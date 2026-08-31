import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): { client: S3Client; bucket: string; publicUrl: string } {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const rawBucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "crmtoi";
  const bucket = rawBucket.replace(/\/+$/, "");
  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT ??
    `https://${accountId}.r2.cloudflarestorage.com`;
  const publicUrl = (
    process.env.CLOUDFLARE_R2_PUBLIC_URL ??
    `https://pub-${accountId}.r2.dev`
  ).replace(/\/+$/, "");

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 no esta configurado. Asegurate de incluir CLOUDFLARE_R2_ACCESS_KEY_ID y CLOUDFLARE_R2_SECRET_ACCESS_KEY en tu .env"
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, bucket, publicUrl };
}

export async function uploadToR2(input: {
  file: Buffer;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const { client, bucket, publicUrl } = getR2Client();

  const cleanFilename = input.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const key = `agent-media/${Date.now()}_${cleanFilename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.file,
      ContentType: input.mimeType,
    })
  );

  return `${publicUrl}/${key}`;
}
