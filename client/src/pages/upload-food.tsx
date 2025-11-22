import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { CloudArrowUpIcon, InformationCircleIcon, ScaleIcon } from "@heroicons/react/24/outline";
import type { FoodAnalysisResult, FoodEntry } from "@shared/schema";

export default function UploadFood() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [weight, setWeight] = useState<string>("100");
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [showAdvice, setShowAdvice] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { user } = useAuth();

  const analyzeMutation = useMutation({
    mutationFn: async ({ file, weight }: { file: File; weight: number }) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("weight", weight.toString());
      const response = await apiRequest<FoodAnalysisResult>("POST", "/api/food/analyzeByModel", formData);
      return response;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowAdvice(false);
      toast({
        title: "Food analyzed!",
        description: `${data.foodName} identified - ${data.totalCalories} kcal estimated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const addToTrackerMutation = useMutation({
    mutationFn: async (data: FoodAnalysisResult) => {
      const entry = {
        userId: user?.id,
        foodName: data.foodName,
        calories: data.totalCalories,
        weight: data.weight,
        dietComment: data.advice,
      };
      const response = await apiRequest<FoodEntry>("POST", "/api/food/entry", entry);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calories/daily"] });
      toast({
        title: "Added to tracker!",
        description: "Food entry has been logged successfully.",
      });
      handleReset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setShowAdvice(false);
    }
  };

  const handleAnalyze = () => {
    if (selectedImage) {
      const weightValue = parseFloat(weight) || 100;
      analyzeMutation.mutate({ file: selectedImage, weight: weightValue });
    }
  };

  const handleReviewFood = () => {
    setShowAdvice(true);
  };

  const handleAddToTracker = () => {
    if (result) {
      addToTrackerMutation.mutate(result);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setPreviewUrl(null);
    setResult(null);
    setWeight("100");
    setShowAdvice(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold font-['Poppins'] mb-2">Upload Food Image</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Take a photo of your meal to get instant calorie estimation and dietary feedback
        </p>
      </div>

      <Card>
        <CardContent className="p-8">
          {!previewUrl ? (
            <div
              className="border-2 border-dashed rounded-2xl p-12 h-96 flex flex-col items-center justify-center gap-4 hover-elevate cursor-pointer"
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <CloudArrowUpIcon className="h-16 w-16 text-muted-foreground" />
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">Upload food image</p>
                <p className="text-sm text-muted-foreground">
                  Click to browse or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
              </div>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                data-testid="input-file"
              />
            </div>
          ) : (
            <div className="space-y-8">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Food preview"
                  className="w-full rounded-xl shadow-lg max-h-96 object-cover"
                />
              </div>
              
              {!result ? (
                <div className="space-y-4">
                  <div className="max-w-xs mx-auto">
                    <Label htmlFor="weight" className="text-sm font-semibold mb-2 block">
                      Food Weight (grams)
                    </Label>
                    <div className="relative">
                      <ScaleIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="weight"
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="pl-10"
                        placeholder="100"
                        min="1"
                        data-testid="input-weight"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default: 100g (if not provided)
                    </p>
                  </div>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={handleAnalyze}
                      disabled={analyzeMutation.isPending}
                      className="h-12 px-8 rounded-lg font-semibold"
                      data-testid="button-analyze"
                    >
                      {analyzeMutation.isPending ? "Analyzing..." : "Analyze Food"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="h-12 px-8 rounded-lg font-semibold"
                      data-testid="button-reset"
                    >
                      Choose Another
                    </Button>
                  </div>
                </div>
              ) : (
                <Card className="p-8 rounded-2xl shadow-lg bg-primary/5">
                  <div className="space-y-8">
                    <div className="text-center space-y-4">
                      <h3 className="text-3xl font-bold font-['Poppins']" data-testid="text-food-name">
                        {result.foodName}
                      </h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className="text-5xl font-bold text-primary" data-testid="text-food-calories">
                            {result.totalCalories}
                          </div>
                          <div className="text-lg font-medium text-muted-foreground">kcal</div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {result.caloriesPer100g} kcal per 100g × {result.weight}g
                        </p>
                      </div>
                    </div>
                    
                    {showAdvice && (
                      <div className="flex gap-4 p-4 rounded-lg bg-muted/50 animate-in fade-in slide-in-from-top-2">
                        <InformationCircleIcon className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Nutritional Advice</p>
                          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-advice">
                            {result.advice}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4">
                      {!showAdvice && (
                        <Button
                          onClick={handleReviewFood}
                          variant="outline"
                          className="flex-1 h-12 rounded-lg font-semibold"
                          data-testid="button-review"
                        >
                          Review the Food
                        </Button>
                      )}
                      <Button
                        onClick={handleAddToTracker}
                        disabled={addToTrackerMutation.isPending}
                        className="flex-1 h-12 rounded-lg font-semibold"
                        data-testid="button-add-tracker"
                      >
                        {addToTrackerMutation.isPending ? "Adding..." : "Add to Tracker"}
                      </Button>
                    </div>

                    <Button
                      onClick={handleReset}
                      variant="ghost"
                      className="w-full h-12 rounded-lg font-semibold"
                      data-testid="button-upload-another"
                    >
                      Upload Another Food
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
