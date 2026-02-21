/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Type } from '@google/genai';

export interface Form {
  formId: string;
  category?: string;
  description?: string;
  size?: string;
  paper?: string;
  color?: string;
  sides?: string;
  unit?: string;
  file0?: string;
  file1?: string;
  pdf0?: string;
}

const API_BASE_URL = 'https://snfforms.vercel.app';

/**
 * Helper function to fetch data from the SNF Forms API.
 */
async function fetchAPI<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) {
      url.searchParams.append(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    // Attempt to parse error message from JSON, fallback to status text
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || response.statusText);
    } catch {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
  }
  return response.json() as Promise<T>;
}

/**
 * Lists all forms, optionally filtered by category or search query.
 */
export async function listForms(
  category?: string,
  query?: string,
): Promise<Form[]> {
  return fetchAPI<Form[]>('/api/forms', { category, query });
}

/**
 * Gets a single form by its ID.
 */
export async function getForm(formId: string): Promise<Form> {
  return fetchAPI<Form>(`/api/forms/${formId}`);
}

/**
 * Searches the forms catalog.
 */
export async function searchForms(
  query?: string,
  category?: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ results: Form[]; total: number; limit: number; offset: number }> {
  return fetchAPI<{
    results: Form[];
    total: number;
    limit: number;
    offset: number;
  }>('/api/search', { query, category, limit, offset });
}

// TODO: Create an order form function that sends an email to the owner with the order details.

/**
 * Function declarations for the Gemini Live API tool configuration.
 */
export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'list_forms',
    description:
      'List all forms in the catalog, optionally filtered by category or search query.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description:
            'Filter forms by exact category match (case-insensitive).',
        },
        query: {
          type: Type.STRING,
          description: 'Search forms by ID or description (case-insensitive).',
        },
      },
    },
  },
  {
    name: 'get_form',
    description:
      'Get a form by its unique ID (e.g., SNF-24) to read its full details including color, size, and paper.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        formId: {
          type: Type.STRING,
          description: 'The unique identifier of the form.',
        },
      },
      required: ['formId'],
    },
  },
  {
    name: 'search_forms',
    description:
      'Search the forms catalog to find a form ID, which can then be used with get_form to read full details.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search term for ID, description, or category.',
        },
        category: {
          type: Type.STRING,
          description: 'Filter by exact category match.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of results to return (default 20).',
        },
        offset: {
          type: Type.INTEGER,
          description: 'Number of results to skip (default 0).',
        },
      },
    },
  },
];
