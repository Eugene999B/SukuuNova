import {
  CreateCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand
} from "@aws-sdk/client-rekognition";

export type FaceSearchResult = {
  externalId?: string;
  faceId?: string;
  confidence?: number;
};

export interface FaceProvider {
  indexFace(input: {
    collectionId: string;
    externalId: string;
    imageBytes: Uint8Array;
  }): Promise<{ faceId: string }>;
  searchFace(input: {
    collectionId: string;
    imageBytes: Uint8Array;
  }): Promise<FaceSearchResult>;
}

function client() {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is required for face recognition.");
  return new RekognitionClient({ region });
}

export class AwsRekognitionFaceProvider implements FaceProvider {
  async indexFace(input: {
    collectionId: string;
    externalId: string;
    imageBytes: Uint8Array;
  }) {
    const rekognition = client();
    try {
      await rekognition.send(new CreateCollectionCommand({
        CollectionId: input.collectionId
      }));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "ResourceAlreadyExistsException"
      ) {
        throw error;
      }
    }
    const result = await rekognition.send(new IndexFacesCommand({
      CollectionId: input.collectionId,
      ExternalImageId: input.externalId,
      Image: { Bytes: input.imageBytes },
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: []
    }));
    const faceId = result.FaceRecords?.[0]?.Face?.FaceId;
    if (!faceId) throw new Error("AWS Rekognition did not find one usable face.");
    return { faceId };
  }

  async searchFace(input: {
    collectionId: string;
    imageBytes: Uint8Array;
  }): Promise<FaceSearchResult> {
    const result = await client().send(new SearchFacesByImageCommand({
      CollectionId: input.collectionId,
      Image: { Bytes: input.imageBytes },
      FaceMatchThreshold: 0,
      MaxFaces: 1,
      QualityFilter: "AUTO"
    }));
    const match = result.FaceMatches?.[0];
    return {
      externalId: match?.Face?.ExternalImageId,
      faceId: match?.Face?.FaceId,
      confidence: match?.Similarity
    };
  }
}

export const awsFaceProvider = new AwsRekognitionFaceProvider();
