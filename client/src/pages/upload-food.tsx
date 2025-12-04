import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch"; // Cần import Switch (nếu có trong shadcn/ui)
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, PlayCircle, Image as ImageIcon, Wand2 } from "lucide-react";
import { CloudArrowUpIcon, InformationCircleIcon, ScaleIcon } from "@heroicons/react/24/outline";
import type { FoodEntry } from "@shared/schema";

interface AnalysisResult {
  foodName: string;
  caloriesPer100g: number;
  weight: number;
  totalCalories: number;
  advice: string;
  annotatedData: string;
  type: "image" | "video";
  detections: any[];
}

export default function UploadFood() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"image" | "video">("image");
  
  // [STATE MỚI]
  const [useAutoWeight, setUseAutoWeight] = useState(true); // Mặc định là Auto
  const [weight, setWeight] = useState<string>("100");
  
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [showAdvice, setShowAdvice] = useState(false);
  const [personalizedAdvice, setPersonalizedAdvice] = useState<string | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (result && result.type === "video" && result.annotatedData) {
      try {
        const header = result.annotatedData.split(';')[0];
        const mimeType = header.split(':')[1];
        const base64Data = result.annotatedData.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setProcessedVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Error creating video blob:", e);
        setProcessedVideoUrl(result.annotatedData);
      }
    } else {
      setProcessedVideoUrl(null);
    }
  }, [result]);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("image", selectedFile);
      
      // Gửi lựa chọn của người dùng lên server
      formData.append("useAutoWeight", useAutoWeight.toString());
      
      // Nếu Manual mode, gửi kèm cân nặng người dùng nhập
      if (!useAutoWeight) {
        formData.append("weight", weight);
      }

      const response = await apiRequest<AnalysisResult>("POST", "/api/food/analyzeByModel", formData);
      return response;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowAdvice(false);
      setPersonalizedAdvice(null);
      toast({
        title: "Analysis Complete!",
        description: `Detected: ${data.foodName}`,
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

  // ... (reviewMutation, addToTrackerMutation giữ nguyên) ...
  const reviewMutation = useMutation({
    mutationFn: async (data: { foodName: string; calories: number }) => {
      const response = await apiRequest<{ advice: string }>("POST", "/api/food/review-personalized", data);
      return response;
    },
    onSuccess: (data) => {
      setPersonalizedAdvice(data.advice);
      setShowAdvice(true);
    },
    onError: () => {
      toast({ title: "Review failed", variant: "destructive" });
    },
  });

  const addToTrackerMutation = useMutation({
    mutationFn: async ({ data, currentAdvice }: { data: AnalysisResult; currentAdvice: string | null }) => {
      let finalAdvice = currentAdvice;
      if (!finalAdvice) {
        const reviewResponse = await apiRequest<{ advice: string }>("POST", "/api/food/review-personalized", {
          foodName: data.foodName,
          calories: data.totalCalories
        });
        finalAdvice = reviewResponse.advice;
        setPersonalizedAdvice(finalAdvice); 
        setShowAdvice(true);
      }
      const entry = {
        userId: user?.id,
        foodName: data.foodName,
        calories: data.totalCalories,
        weight: data.weight || 0, // Lưu 0 nếu là Auto, hoặc số gram nếu Manual
        dietComment: finalAdvice,
      };
      const response = await apiRequest<FoodEntry>("POST", "/api/food/entry", entry);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calories/daily"] });
      toast({ title: "Added to tracker!", description: "Food entry logged successfully." });
      handleReset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const type = file.type.startsWith("video/") ? "video" : "image";
      setFileType(type);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setProcessedVideoUrl(null);
      setShowAdvice(false);
      setPersonalizedAdvice(null);
    }
  };

  const handleReviewFood = () => {
    if (result) {
      reviewMutation.mutate({ foodName: result.foodName, calories: result.totalCalories });
    }
  };

  const handleAddToTracker = () => {
    if (result) {
      addToTrackerMutation.mutate({ data: result, currentAdvice: personalizedAdvice });
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setProcessedVideoUrl(null);
    setWeight("100");
    setShowAdvice(false);
    setPersonalizedAdvice(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold font-['Poppins'] mb-2">Vision Agent Analysis</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Upload a photo or short video. Our AI Agent will detect dishes and estimate calories.
        </p>
      </div>

      <Card>
        <CardContent className="p-8">
          {!previewUrl ? (
            <div
              className="border-2 border-dashed rounded-2xl p-12 h-96 flex flex-col items-center justify-center gap-4 hover-elevate cursor-pointer hover:bg-muted/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex gap-4">
                <CloudArrowUpIcon className="h-16 w-16 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">Upload Image or Video</p>
                <p className="text-sm text-muted-foreground">Click to browse or drag and drop</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, MP4 (Max 10MB)</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Media Preview */}
              <div className="relative rounded-xl overflow-hidden shadow-lg bg-black/5 min-h-[300px] flex items-center justify-center">
                {result ? (
                  result.type === "video" ? (
                    processedVideoUrl ? (
                      <video key={processedVideoUrl} src={processedVideoUrl} controls autoPlay loop className="w-full max-h-[500px] object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading video...</p></div>
                    )
                  ) : (
                    <img src={result.annotatedData} alt="Result" className="w-full max-h-[500px] object-contain" />
                  )
                ) : (
                  fileType === "video" ? (
                    <video src={previewUrl} controls className="w-full max-h-[500px] object-contain" />
                  ) : (
                    <img src={previewUrl} alt="Preview" className="w-full max-h-[500px] object-contain" />
                  )
                )}
              </div>
              
              {!result ? (
                <div className="space-y-6">
                  {/* [GIAO DIỆN CHỌN CHẾ ĐỘ] */}
                  <div className="flex flex-col items-center gap-4 p-4 bg-muted/30 rounded-lg border max-w-md mx-auto">
                    <div className="flex items-center gap-3 w-full justify-center">
                      <Label htmlFor="mode-toggle" className={`text-sm font-medium ${!useAutoWeight ? "text-primary" : "text-muted-foreground"}`}>
                        Manual Input
                      </Label>
                      <Switch 
                        id="mode-toggle" 
                        checked={useAutoWeight} 
                        onCheckedChange={setUseAutoWeight} 
                      />
                      <Label htmlFor="mode-toggle" className={`text-sm font-medium flex items-center gap-1 ${useAutoWeight ? "text-primary" : "text-muted-foreground"}`}>
                        <Wand2 className="h-3.5 w-3.5" /> Auto Estimate
                      </Label>
                    </div>

                    {!useAutoWeight && (
                      <div className="w-full max-w-xs animate-in slide-in-from-top-2 fade-in">
                        <Label htmlFor="weight" className="text-xs text-muted-foreground mb-1.5 block">Total Meal Weight (grams)</Label>
                        <div className="relative">
                          <ScaleIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="weight"
                            type="number"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            className="pl-9 h-10"
                            placeholder="e.g. 500"
                            min="1"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Total calories will be distributed based on detected items size.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 justify-center">
                    <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} className="h-12 px-8 rounded-lg font-semibold min-w-[200px]">
                      {analyzeMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                      ) : (
                        <><ImageIcon className="mr-2 h-4 w-4"/> Analyze {fileType === "video" ? "Video" : "Image"}</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleReset} className="h-12 px-8 rounded-lg font-semibold">Cancel</Button>
                  </div>
                </div>
              ) : (
                <Card className="p-8 rounded-2xl shadow-lg bg-primary/5 animate-in fade-in slide-in-from-bottom-4">
                  <div className="space-y-8">
                    <div className="text-center space-y-4">
                      <h3 className="text-3xl font-bold font-['Poppins']">{result.foodName}</h3>
                      {result.detections && result.detections.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Detected items: 
                          <ul className="flex flex-wrap justify-center gap-2 mt-2">
                            {result.detections.map((d, i) => (
                              <li key={i} className="bg-white px-2 py-1 rounded shadow-sm border text-xs flex gap-1">
                                <span className="font-semibold">{d.class}</span>
                                <span className="text-muted-foreground">({d.estimated_weight}g)</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className="text-5xl font-bold text-primary">{result.totalCalories}</div>
                          <div className="text-lg font-medium text-muted-foreground">kcal</div>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {useAutoWeight ? "AI Estimated Total" : `Based on your ${weight}g input`}
                        </p>
                      </div>
                    </div>
                    
                    {showAdvice && (
                      <div className="flex gap-4 p-4 rounded-lg bg-muted/50">
                        <InformationCircleIcon className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                        <div className="space-y-1"><p className="text-sm font-semibold">Personalized Advice</p><p className="text-sm text-muted-foreground leading-relaxed">{personalizedAdvice || result.advice}</p></div>
                      </div>
                    )}

                    <div className="flex gap-4">
                      {!showAdvice && (
                        <Button onClick={handleReviewFood} variant="outline" className="flex-1 h-12 rounded-lg font-semibold" disabled={reviewMutation.isPending || addToTrackerMutation.isPending}>
                          {reviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Get Advice"}
                        </Button>
                      )}
                      <Button onClick={handleAddToTracker} disabled={addToTrackerMutation.isPending || reviewMutation.isPending} className="flex-1 h-12 rounded-lg font-semibold">
                        {addToTrackerMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : "Add to Tracker"}
                      </Button>
                    </div>
                    <Button onClick={handleReset} variant="ghost" className="w-full h-12 rounded-lg font-semibold">Upload Another File</Button>
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