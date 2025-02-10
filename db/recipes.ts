import type { ObjectId } from "mongodb";
import { db } from "../utils/db";

export interface RecipeModel {
    _id?: ObjectId,
    instructions: string[],
    ingredients: string[],
}

const collection = db.collection("recipes");

export async function addRecipe(recipe: RecipeModel): Promise<string> {
    const r = await collection.insertOne(recipe);
    return r.insertedId.toString("hex");
}
