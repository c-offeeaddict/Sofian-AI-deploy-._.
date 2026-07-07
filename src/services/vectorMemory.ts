
import { VectorDocument } from "../types";
import { getEmbedding } from "./neuralService";
import { generateId } from "../lib/utils";

// Helper for dot product
const dotProduct = (a: number[], b: number[]): number => {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
};

// Helper for magnitude
const magnitude = (v: number[]): number => {
    return Math.sqrt(dotProduct(v, v));
};

// Cosine similarity
const cosineSimilarity = (a: number[], b: number[]): number => {
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(a, b) / (magA * magB);
};

export const saveToVectorDb = async (text: string, currentDocs: VectorDocument[]): Promise<VectorDocument[]> => {
    const embedding = await getEmbedding(text);
    if (!embedding) return currentDocs;

    const newDoc: VectorDocument = {
        id: generateId(),
        text,
        embedding,
        timestamp: Date.now()
    };

    return [...currentDocs, newDoc];
};

export const queryVectorDb = async (query: string, docs: VectorDocument[], topK: number = 2): Promise<string[]> => {
    if (!docs || docs.length === 0) return [];

    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) return [];

    const scoredDocs = docs.map(doc => ({
        ...doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    // Sort by score descending
    scoredDocs.sort((a, b) => b.score - a.score);

    // Filter for relevance (e.g., > 0.6 similarity) and return top K
    return scoredDocs
        .filter(d => d.score > 0.55)
        .slice(0, topK)
        .map(d => d.text);
};
