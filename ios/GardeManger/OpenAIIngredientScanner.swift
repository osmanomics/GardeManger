import Foundation

struct OpenAIIngredientScanner {
    let apiKey: String
    let model: String
    let recipeModel: String

    static func fromBundle() throws -> OpenAIIngredientScanner {
        let apiKey = configuredValue(for: "GardeOpenAIAPIKey")
        guard let apiKey else {
            throw ScanError.missingAPIKey
        }

        return OpenAIIngredientScanner(
            apiKey: apiKey,
            model: configuredValue(for: "GardeOpenAIModel") ?? "gpt-5.5",
            recipeModel: configuredValue(for: "GardeOpenAIRecipeModel")
                ?? configuredValue(for: "GardeOpenAIModel")
                ?? "gpt-5.5"
        )
    }

    func scan(imageDataURL: String) async throws -> ScanResponse {
        guard imageDataURL.hasPrefix("data:image/") else {
            throw ScanError.invalidImage
        }

        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/responses")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody(imageDataURL: imageDataURL))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ScanError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw ScanError.apiError(status: httpResponse.statusCode, body: body)
        }

        let envelope = try JSONDecoder().decode(ResponsesEnvelope.self, from: data)
        let output = try envelope.outputText()
        let structured = try JSONDecoder().decode(StructuredScan.self, from: Data(output.utf8))

        return ScanResponse(
            mode: "ai",
            model: model,
            ingredients: normalize(structured.ingredients),
            notes: structured.notes
        )
    }

    func recipes(ingredients: [String], preferences: RecipePreferences) async throws -> RecipeResponse {
        let normalizedIngredients = normalizeIngredientList(ingredients)
        guard !normalizedIngredients.isEmpty else {
            throw ScanError.missingIngredients
        }

        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/responses")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(
            withJSONObject: recipeRequestBody(ingredients: normalizedIngredients, preferences: preferences)
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ScanError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "No response body."
            throw ScanError.apiError(status: httpResponse.statusCode, body: body)
        }

        let envelope = try JSONDecoder().decode(ResponsesEnvelope.self, from: data)
        let output = try envelope.outputText()
        let structured = try JSONDecoder().decode(StructuredRecipes.self, from: Data(output.utf8))

        return RecipeResponse(
            mode: "ai",
            model: recipeModel,
            recipes: normalizeRecipes(structured.recipes),
            notes: structured.notes
        )
    }

    private static func configuredValue(for key: String) -> String? {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: key) as? String
        else {
            return nil
        }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("$(") else {
            return nil
        }
        return trimmed
    }

    private func requestBody(imageDataURL: String) -> [String: Any] {
        [
            "model": model,
            "input": [
                [
                    "role": "system",
                    "content": "You identify visible food ingredients in fridge and pantry photos for a consumer recipe app. Return only ingredients that are visually plausible. Do not infer hidden items."
                ],
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "input_text",
                            "text": "List visible recipe ingredients. Use common names like eggs, tomatoes, rice, canned beans, yogurt, chicken. Avoid brands and packaging text unless the food item is clear."
                        ],
                        [
                            "type": "input_image",
                            "image_url": imageDataURL,
                            "detail": "low"
                        ]
                    ]
                ]
            ],
            "max_output_tokens": 650,
            "text": [
                "format": [
                    "type": "json_schema",
                    "name": "pantry_scan",
                    "strict": true,
                    "schema": ingredientSchema
                ]
            ]
        ]
    }

    private func recipeRequestBody(ingredients: [String], preferences: RecipePreferences) -> [String: Any] {
        [
            "model": recipeModel,
            "input": [
                [
                    "role": "system",
                    "content": "You create practical home-cooking recipes for a pantry recipe app. Prefer the user's available ingredients, allow a few common pantry staples, and keep instructions concise."
                ],
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "input_text",
                            "text": recipePrompt(ingredients: ingredients, preferences: preferences)
                        ]
                    ]
                ]
            ],
            "max_output_tokens": 1100,
            "text": [
                "format": [
                    "type": "json_schema",
                    "name": "pantry_recipes",
                    "strict": true,
                    "schema": recipeSchema
                ]
            ]
        ]
    }

    private func recipePrompt(ingredients: [String], preferences: RecipePreferences) -> String {
        var lines = [
            "Available ingredients: \(ingredients.joined(separator: ", ")).",
            "Generate 4 varied recipes that feel fresh and not like the same default list.",
            "Use common recipe ingredient names, not brands. Include salt, pepper, oil, water, butter, flour, vinegar, or sugar only when useful.",
            "Every recipe must be cookable by a normal home cook and must include clear steps."
        ]

        if preferences.vegetarian {
            lines.append("Only return vegetarian recipes.")
        }

        if preferences.fast {
            lines.append("Prefer recipes that take 25 minutes or less.")
        }

        if !preferences.staples {
            lines.append("Do not assume pantry staples unless they are in the available ingredients list.")
        }

        return lines.joined(separator: " ")
    }

    private var ingredientSchema: [String: Any] {
        [
            "type": "object",
            "additionalProperties": false,
            "required": ["ingredients", "notes"],
            "properties": [
                "ingredients": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "confidence", "category", "state"],
                        "properties": [
                            "name": [
                                "type": "string",
                                "description": "Common grocery ingredient name in singular/plural everyday English."
                            ],
                            "confidence": [
                                "type": "number",
                                "description": "Detection confidence from 0 to 1."
                            ],
                            "category": [
                                "type": "string",
                                "enum": ["produce", "protein", "dairy", "grain", "pantry", "bakery", "frozen", "drink", "condiment", "other"]
                            ],
                            "state": [
                                "type": "string",
                                "enum": ["fresh", "packaged", "opened", "unknown"]
                            ]
                        ]
                    ]
                ],
                "notes": [
                    "type": "string"
                ]
            ]
        ]
    }

    private var recipeSchema: [String: Any] {
        [
            "type": "object",
            "additionalProperties": false,
            "required": ["recipes", "notes"],
            "properties": [
                "recipes": [
                    "type": "array",
                    "minItems": 4,
                    "maxItems": 4,
                    "items": [
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "time", "serves", "level", "vegetarian", "ingredients", "steps"],
                        "properties": [
                            "name": ["type": "string"],
                            "time": ["type": "integer", "minimum": 5, "maximum": 90],
                            "serves": ["type": "integer", "minimum": 1, "maximum": 8],
                            "level": ["type": "string", "enum": ["Easy", "Medium", "Hard"]],
                            "vegetarian": ["type": "boolean"],
                            "ingredients": [
                                "type": "array",
                                "minItems": 4,
                                "maxItems": 12,
                                "items": ["type": "string"]
                            ],
                            "steps": [
                                "type": "array",
                                "minItems": 3,
                                "maxItems": 4,
                                "items": ["type": "string"]
                            ]
                        ]
                    ]
                ],
                "notes": ["type": "string"]
            ]
        ]
    }

    private func normalize(_ items: [Ingredient]) -> [Ingredient] {
        var seen = Set<String>()
        var normalized: [Ingredient] = []

        for item in items {
            let name = normalizeName(item.name)
            guard !name.isEmpty, !seen.contains(name) else {
                continue
            }

            seen.insert(name)
            normalized.append(
                Ingredient(
                    name: name,
                    confidence: clamp(item.confidence, min: 0.35, max: 0.99),
                    category: item.category.isEmpty ? "other" : item.category,
                    state: item.state.isEmpty ? "unknown" : item.state
                )
            )

            if normalized.count == 18 {
                break
            }
        }

        return normalized
    }

    private func normalizeIngredientList(_ items: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []

        for item in items {
            let name = normalizeName(item)
            guard !name.isEmpty, !seen.contains(name) else {
                continue
            }

            seen.insert(name)
            normalized.append(name)

            if normalized.count == 60 {
                break
            }
        }

        return normalized
    }

    private func normalizeRecipes(_ items: [Recipe]) -> [Recipe] {
        var seen = Set<String>()
        var normalized: [Recipe] = []

        for item in items {
            let key = normalizeName(item.name)
            let ingredients = normalizeIngredientList(item.ingredients)
            let steps = item.steps
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            guard
                !key.isEmpty,
                !seen.contains(key),
                ingredients.count >= 3,
                steps.count >= 2
            else {
                continue
            }

            seen.insert(key)
            normalized.append(
                Recipe(
                    name: item.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    time: Int(clamp(Double(item.time), min: 5, max: 90)),
                    serves: Int(clamp(Double(item.serves), min: 1, max: 8)),
                    level: ["Easy", "Medium", "Hard"].contains(item.level) ? item.level : "Easy",
                    vegetarian: item.vegetarian,
                    ingredients: Array(ingredients.prefix(12)),
                    steps: Array(steps.prefix(6))
                )
            )

            if normalized.count == 6 {
                break
            }
        }

        return normalized
    }

    private func normalizeName(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    private func clamp(_ value: Double, min: Double, max: Double) -> Double {
        Swift.max(min, Swift.min(max, value))
    }
}

extension OpenAIIngredientScanner {
    struct ScanResponse: Encodable {
        let mode: String
        let model: String
        let ingredients: [Ingredient]
        let notes: String
    }

    struct RecipeResponse: Encodable {
        let mode: String
        let model: String
        let recipes: [Recipe]
        let notes: String
    }

    struct RecipePreferences {
        let staples: Bool
        let vegetarian: Bool
        let fast: Bool
    }

    struct Recipe: Codable {
        let name: String
        let time: Int
        let serves: Int
        let level: String
        let vegetarian: Bool
        let ingredients: [String]
        let steps: [String]
    }

    struct Ingredient: Codable {
        let name: String
        let confidence: Double
        let category: String
        let state: String
    }

    enum ScanError: LocalizedError {
        case missingAPIKey
        case invalidImage
        case invalidResponse
        case missingOutput
        case missingIngredients
        case apiError(status: Int, body: String)

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "Missing OpenAI API key. Set GARDE_OPENAI_API_KEY for the iOS target."
            case .invalidImage:
                return "Choose a pantry photo before scanning."
            case .invalidResponse:
                return "The AI scan returned an invalid response."
            case .missingOutput:
                return "The AI scan did not return ingredients."
            case .missingIngredients:
                return "Add ingredients before generating recipes."
            case .apiError(let status, let body):
                return "OpenAI scan failed with status \(status): \(body.prefix(240))"
            }
        }
    }

    private struct StructuredScan: Decodable {
        let ingredients: [Ingredient]
        let notes: String
    }

    private struct StructuredRecipes: Decodable {
        let recipes: [Recipe]
        let notes: String
    }

    private struct ResponsesEnvelope: Decodable {
        let outputTextValue: String?
        let output: [OutputItem]?

        enum CodingKeys: String, CodingKey {
            case outputTextValue = "output_text"
            case output
        }

        func outputText() throws -> String {
            if let outputTextValue, !outputTextValue.isEmpty {
                return outputTextValue
            }

            for item in output ?? [] {
                for content in item.content ?? [] {
                    if let text = content.text, !text.isEmpty {
                        return text
                    }
                }
            }

            throw ScanError.missingOutput
        }
    }

    private struct OutputItem: Decodable {
        let content: [OutputContent]?
    }

    private struct OutputContent: Decodable {
        let text: String?
    }
}
