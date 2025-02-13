import * as Minio from 'minio'

export const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_URL || "",
    port: Number.parseInt(process.env.MINIO || "9000"),
    useSSL: process.env.MINIO_SSL === "true" || false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

// For some reasons, minio bucket names has to be lowercase
export const recipeBucketName = "recipescover"

const exists = await minioClient.bucketExists(recipeBucketName)
if (exists) {
    console.log(`Bucket ${recipeBucketName} exists`);
} else {
    await minioClient.makeBucket(recipeBucketName)
    console.log(`Bucket ${recipeBucketName} created`);
}

