import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const getS3Client = () => {
  return new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
};

export const uploadFileToS3 = async (fileBuffer, originalName, mimeType) => {
  try {
    const s3Client = getS3Client();
    const fileExtension = originalName.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const fileKey = `chat_media/${uniqueFileName}`;
    
    // Check if configuration exists
    if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID) {
      throw new Error("AWS credentials are not properly configured in .env file.");
    }

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: mimeType,
      // ACL: "public-read" // Optional based on bucket settings, usually disabled in newer buckets
    });

    await s3Client.send(command);

    const region = process.env.AWS_REGION || "ap-south-1";
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    
    // Construct and return the S3 public URL
    return `https://${bucket}.s3.${region}.amazonaws.com/${fileKey}`;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw error;
  }
};
