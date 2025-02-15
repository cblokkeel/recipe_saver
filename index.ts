import { JSDOM } from "jsdom";
import { getRecipeDetails, getRecipeImage } from "./utils/ai";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";
import { minioClient, recipeBucketName } from "./utils/minio";
import sharp from "sharp";

interface Recipe {
    title: string;
    ingredients: string[];
    instructions: string[];
}

function removeTags(html: string) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const tagsToRemove = ["script", "footer", "header", "style", "head", "link", "noscript"];
    tagsToRemove.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach((element: any) => {
            element.remove();
        });
    });

    return dom.serialize();
}

function removeSpaces(str: string) {
    return str.replace(/\s+/g, "");
}

function parseAiResponse(txt: string): Recipe {
    const split = txt.split("\n");
    return JSON.parse(split.slice(1, split.length - 1).join("\n")) as Recipe;
}

const recipeReqSchema = z.object({
    recipeUrl: z.string().url(),
});

function formatTitle(str: string): string {
    return str
            .split(" ")
            .map((word: string, index: number) =>
                index === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
            )
            .join(" ");
}

async function uploadImageToMinIO(imageUrl: string, bucketName: string, objectName: string) {
    try {
        const response = await fetch(imageUrl);
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        sharp(buffer)
            .resize(800, 800, {
                fit: "inside",
                withoutEnlargement: true,
            })
            .toFormat("jpeg")
            .jpeg({
                quality: 80,
                chromaSubsampling: "4:2:0"
            })
            .toBuffer()
            .then((optimized) => {
                minioClient.putObject(bucketName, objectName, optimized).then(() => {
                    console.log(`uploaded ${objectName} successfully`);
                }).catch((error) => {
                    console.error(`error uploading img ${objectName}: ${error}`);
                });
            })
            .catch((error) => {
                console.error("error optimizing img: ", error);
            });
    } catch (error) {
        console.error("error fetching image:", error);
    }
}

const app = new Hono();

app.post(
    "/recipe",
    validator("json", (value, c) => {
        const parsed = recipeReqSchema.safeParse(value);
        if (!parsed.success) {
            return c.text("invalid req body", 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const { recipeUrl } = c.req.valid("json");

        const res = await fetch(recipeUrl);
        const html = await res.text();

        const parsed = removeSpaces(removeTags(html));

        const aiResponse = await getRecipeDetails(parsed);
        const recipe = parseAiResponse(aiResponse || "");

        recipe.title = formatTitle(recipe.title);

        getRecipeImage(recipe).then((imgUrl) => {
            if (imgUrl) {
                uploadImageToMinIO(imgUrl, recipeBucketName, `${recipe.title.replace(" ", "_").toLowerCase()}_cover.jpeg`);
            }
        });

        return c.json(recipe, 200);
    }
);

export default {
    port: 1171,
    fetch: app.fetch,
}
