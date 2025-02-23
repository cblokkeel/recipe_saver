import { JSDOM } from "jsdom";
import { getGroceryListFromIngredients, getRecipeDetails, getRecipeImage } from "./utils/ai";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";
import { minioClient, recipeBucketName } from "./utils/minio";
import sharp from "sharp";
import type { UUID } from "node:crypto";

interface Recipe {
    minioId: UUID;
    title: string;
    ingredients: string[];
    instructions: string[];
}

interface Grocery {
    list: string[];
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

function parseAiResponse<T>(txt: string): T {
    const split = txt.split("\n");
    return JSON.parse(split.slice(1, split.length - 1).join("\n")) as T;
}

const recipeReqSchema = z.object({
    recipeUrl: z.string().url(),
});

const groceryReqSchema = z.object({
    ingredients: z.array(z.string()).min(1),
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
        const recipe = parseAiResponse<Recipe>(aiResponse || "");

        recipe.title = formatTitle(recipe.title);
        recipe.minioId = crypto.randomUUID();

        getRecipeImage(recipe).then((imgUrl) => {
            if (imgUrl) {
                uploadImageToMinIO(imgUrl, recipeBucketName, `public/${recipe.minioId}.jpeg`);
            }
        });

        return c.json(recipe, 200);
    }
);

app.post(
    "/grocery",
    validator("json", (value, c) => {
        const parsed = groceryReqSchema.safeParse(value);
        if (!parsed.success) {
            return c.text("invalid req body", 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const { ingredients } = c.req.valid("json");

        const aiResponse = await getGroceryListFromIngredients(ingredients);
        const list = parseAiResponse<Grocery>(aiResponse || "");

        return c.json(list, 200);
   }
);

export default {
    port: 1171,
    fetch: app.fetch,
}
