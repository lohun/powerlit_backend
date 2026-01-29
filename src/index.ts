import express from 'express';
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import 'dotenv/config';


const port = process.env.PORT
const app = express()

const { json, text } = express;

app.use(text());
app.use(json());
app.use(cors());


const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClientData {
    clientId: string;
    fullName: string;
    state: string;
    lga: string;
    estimatedLoadKW: number;
    dailyUsageHours: number;
    propertyType: string;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
console.log(GEMINI_API_KEY)



// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and API Key must be provided in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);


app.post("/make_recommendation", async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
        return res.set(corsHeaders)
        // return new Response(null, { headers: corsHeaders });
    }

    try {
        const clientData: ClientData = req.body;
        console.log("Generating recommendation for:", clientData.fullName);

        const prompt = `[user] You are an expert electrical engineer specializing in Nigerian power solutions.
  
  CLIENT PROFILE:
  - Name: ${clientData.fullName}
  - Location: ${clientData.lga}, ${clientData.state}, Nigeria
  - Power Requirement: ${clientData.estimatedLoadKW} kW
  - Daily Usage: ${clientData.dailyUsageHours} hours
  - Property Type: ${clientData.propertyType}
  
  TASK: Provide a detailed alternate power recommendation for this Nigerian client.
  
  IMPORTANT: Return ONLY valid JSON with no markdown formatting, no backticks, no explanations outside the JSON.
  
  The JSON structure must be exactly:
  {
  "summary": "A 2-3 sentence overview of the recommended power solution",
  "reasoning": "A detailed 100-150 word explanation of why this solution is ideal for the client's needs, considering their location, load requirements, and property type",
  "primarySolution": "Solar+Battery" or "Hybrid" or "Generator+Inverter",
  "systemCapacityKW": <number - the total system capacity>,
  "solarPanelsCount": <number or null if not applicable>,
  "batteryCapacityKWh": <number or null if not applicable>,
  "inverterSizeKW": <number>,
  "products": [
    {
      "category": "Category name (Solar Panels, Battery, Inverter, etc.)",
      "name": "Specific product name and specs",
      "quantity": <number>,
      "unitPriceNGN": <number in Naira>,
      "totalPriceNGN": <calculated total>,
      "supplier": "Nigerian supplier name"
    }
  ],
  "equipmentCostNGN": <total equipment cost in Naira>,
  "installationCostNGN": <installation cost - typically 15-20% of equipment>,
  "totalCostNGN": <equipment + installation>,
  "monthlyOperatingCost": <monthly maintenance/fuel cost in Naira>,
  "roiMonths": <estimated payback period in months>
  }
  
  Use realistic 2024 Nigerian market prices. Include 3-6 product line items. Consider:
  - Solar panels: ₦80,000-120,000 per 550W panel
  - Lithium batteries: ₦400,000-600,000 per 5kWh
  - Inverters: ₦150,000-400,000 depending on capacity
  - Installation typically 15-20% of equipment cost
  - Factor in the client's location for solar irradiance and grid availability`;
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: ["[system]You are an expert Nigerian electrical engineer. Return only valid JSON, no markdown.", prompt],
            config: { temperature: 1.0 }
        });

        const content = await JSON.parse(response.text!);

        if (!content) {
            throw new Error("No content in AI response");
        }

        console.log("AI response received, parsing...");

        // // Clean and parse the JSON
        // let cleaned = content.trim();
        // // Remove markdown code blocks if present
        // cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/gi, "");
        // // Remove any leading/trailing whitespace
        // cleaned = cleaned.trim();

        // let recommendation;
        // try {
        //     recommendation = JSON.parse(cleaned);
        // } catch (parseError) {
        //     console.error("JSON parse error:", parseError);
        //     console.error("Raw content:", content);
        //     throw new Error("Failed to parse AI response as JSON");
        // }

        // Store in database
        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: savedRec, error: dbError } = await supabase
            .from("recommendations")
            .insert({
                client_id: clientData.clientId,
                summary: content.summary,
                reasoning: content.reasoning,
                primary_solution: content.primarySolution,
                system_capacity_kw: content.systemCapacityKW,
                solar_panels_count: content.solarPanelsCount,
                battery_capacity_kwh: content.batteryCapacityKWh,
                inverter_size_kw: content.inverterSizeKW,
                equipment_cost_ngn: content.equipmentCostNGN,
                installation_cost_ngn: content.installationCostNGN,
                total_cost_ngn: content.totalCostNGN,
                monthly_operating_cost: content.monthlyOperatingCost,
                roi_months: content.roiMonths,
                products_json: content.products,
            })
            .select()
            .single();

        if (dbError) {
            console.error("Database error:", dbError);
            throw new Error("Failed to save recommendation for " + clientData.fullName);
        }

        console.log("Recommendation saved:", savedRec.id);

        return res.set({ ...corsHeaders, "Content-Type": "application/json" }).json(savedRec);
    } catch (error) {
        console.error("Error in generate-recommendation:", error);
        return res.status(500).set({ ...corsHeaders, "Content-Type": "application/json" }).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }

});

app.listen(port, ()=> {
    console.log("Express server running on " + port);
})





