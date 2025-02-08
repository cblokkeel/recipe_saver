import type { ObjectId } from "mongodb";
import { db } from "../utils/db";

export interface RecipeModel {
    _id?: ObjectId,
    instructions: string[],
    ingredients: string[],
}

const collection = db.collection("recipes");

export function addRecipe(recipe: RecipeModel) {
    collection.insertOne(recipe);
}
