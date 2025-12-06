import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { 
  Loader2, PlayCircle, Image as ImageIcon, Wand2, 
  Pencil, Check, X as XIcon, MessageSquare, ChefHat, Clock, Utensils, CheckCircle2,
  Eye, ScanLine, Lightbulb 
} from "lucide-react";
import { CloudArrowUpIcon, InformationCircleIcon, ScaleIcon } from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FoodEntry } from "@shared/schema";

interface AnalysisResult {
  foodName: string;
  caloriesPer100g: number;
  weight: number;
  totalCalories: number;
  advice: string;
  annotatedData: string;
  depthData?: string;
  type: "image" | "video";
  detections: any[];
}

interface RecipeData {
  description: string;
  ingredients: string[];
  instructions: string[];
  macros: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
  };
  cookingTime: string;
  difficulty: string;
}

export default function UploadFood() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"image" | "video">("image");
  
  const [useAutoWeight, setUseAutoWeight] = useState(true);
  const [weight, setWeight] = useState<string>("100");
  
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  
  const [showDepth, setShowDepth] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedWeight, setEditedWeight] = useState(0);
  const [editedCalories, setEditedCalories] = useState(0);

  const [showAdvice, setShowAdvice] = useState(false);
  const [personalizedAdvice, setPersonalizedAdvice] = useState<string | null>(null);
  
  const [selectedRecipeMeal, setSelectedRecipeMeal] = useState<string | null>(null);
  const [isRecipeDialogOpen, setIsRecipeDialogOpen] = useState(false);
  const [recipeData, setRecipeData] = useState<RecipeData | null>(null);

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

  useEffect(() => {
    if (result) {
      setEditedName(result.foodName);
      setEditedWeight(result.weight);
      setEditedCalories(result.totalCalories);
      setIsEditing(false);
      setShowDepth(false);
    }
  }, [result]);

  const handleWeightChange = (newWeightStr: string) => {
    const newWeight = parseFloat(newWeightStr) || 0;
    setEditedWeight(newWeight);
    if (result && result.weight > 0) {
      const newCal = Math.round((newWeight / result.weight) * result.totalCalories);
      setEditedCalories(newCal);
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("useAutoWeight", useAutoWeight.toString());
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
        description: `Agent detected: ${data.foodName}`,
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

  const recipeMutation = useMutation({
    mutationFn: async (mealName: string) => {
      const res = await apiRequest<RecipeData>("POST", "/api/meals/recipe", { mealName });
      return res;
    },
    onSuccess: (data) => {
      setRecipeData(data);
    },
    onError: () => {
      toast({ title: "Failed to load recipe", variant: "destructive" });
      setIsRecipeDialogOpen(false);
    }
  });

  const handleRecipeClick = (mealName: string) => {
    setSelectedRecipeMeal(mealName);
    setRecipeData(null);
    setIsRecipeDialogOpen(true);
    recipeMutation.mutate(mealName);
  };

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

  // [SỬA ĐỔI QUAN TRỌNG]: Logic chia nhỏ món ăn khi lưu
  const addToTrackerMutation = useMutation({
    mutationFn: async () => {
      let finalAdvice = personalizedAdvice;
      if (!finalAdvice && result) {
        const reviewResponse = await apiRequest<{ advice: string }>("POST", "/api/food/review-personalized", {
          foodName: editedName,
          calories: editedCalories
        });
        finalAdvice = reviewResponse.advice;
        setPersonalizedAdvice(finalAdvice); 
        setShowAdvice(true);
      }

      // 1. Nếu có danh sách món ăn từ Vision Agent (Detect > 0)
      if (result?.detections && result.detections.length > 0) {
        // Tính tổng Ratio của các món
        const totalRatio = result.detections.reduce((sum, d) => sum + (d.box_ratio || 0), 0);
        
        // Tạo danh sách các món mới dựa trên tổng cân nặng hiện tại (editedWeight)
        // Điều này đảm bảo nếu user sửa tổng cân nặng, từng món con cũng được chia lại đúng tỷ lệ
        const itemsToSave = result.detections.map(det => {
           let itemWeight = 0;
           if (totalRatio > 0) {
             // Chia tỷ lệ: (Ratio Món / Tổng Ratio) * Tổng Cân Nặng Người Dùng Nhập/Edit
             itemWeight = (det.box_ratio / totalRatio) * editedWeight;
           }
           
           // Tính lại calo cho món đó
           // Calo = (Weight Mới / Weight Cũ của món) * Calo Cũ của món
           // Hoặc an toàn hơn: (Weight Mới * CaloPer100g) / 100 (nhưng ta không có caloPer100g ở đây, nên dùng tỷ lệ)
           const itemCalorie = det.estimated_weight > 0 
              ? Math.round((itemWeight / det.estimated_weight) * det.estimated_calories)
              : 0;

           return {
             ...det,
             foodName: det.class,
             weight: Math.round(itemWeight),
             calories: itemCalorie
           };
        });

        const payload = {
          items: itemsToSave, 
          dietComment: finalAdvice || "Vision Agent Analysis",
        };
        return await apiRequest("POST", "/api/food/entry", payload);
      } 
      // 2. Fallback: Nếu không detect được gì cụ thể (hoặc lỗi), lưu 1 cục
      else {
         const entry = {
          userId: user?.id,
          foodName: editedName,
          calories: editedCalories,
          weight: editedWeight,
          dietComment: finalAdvice,
        };
        return await apiRequest<FoodEntry>("POST", "/api/food/entry", entry);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calories/daily"] });
      toast({ title: "Success!", description: "All detected items added to diary separately." });
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
      reviewMutation.mutate({ foodName: editedName, calories: editedCalories });
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
    setIsEditing(false);
    setShowDepth(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* CSS Animation */}
      <style>{`
        @keyframes scan-vertical {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scanning-line {
          animation: scan-vertical 2s linear infinite;
        }
      `}</style>

      <div>
        <h1 className="text-4xl font-bold font-['Poppins'] mb-2">Vision Agent</h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-4">
          Upload media and let the Agent analyze your meal. You can verify and correct the Agent's estimation.
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium border border-primary/20 animate-in fade-in slide-in-from-left-4">
          <Lightbulb className="h-4 w-4" />
          <span>Mẹo: Để có kết quả chính xác nhất, hãy chụp thẳng góc 90° và để thức ăn chiếm khoảng 70% khung hình.</span>
        </div>
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
              {/* Media Display & Scanning Effect */}
              <div className="relative rounded-xl overflow-hidden shadow-lg bg-black/5 min-h-[300px] flex items-center justify-center group">
                
                {/* Scanning Effect */}
                {analyzeMutation.isPending && (
                  <div className="absolute inset-0 z-20 pointer-events-none">
                    <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_rgba(34,211,238,0.8)] scanning-line z-30" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px] z-20" />
                    <div className="absolute bottom-4 right-4 bg-black/70 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 animate-pulse z-30">
                      <ScanLine className="h-3 w-3" />
                      ANALYZING PIXELS...
                    </div>
                  </div>
                )}

                {result ? (
                  result.type === "video" ? (
                    processedVideoUrl ? (
                      <video key={processedVideoUrl} src={processedVideoUrl} controls autoPlay loop className="w-full max-h-[500px] object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Rendering result...</p></div>
                    )
                  ) : (
                    <img 
                      src={showDepth && result.depthData ? result.depthData : result.annotatedData} 
                      alt="Result" 
                      className="w-full max-h-[500px] object-contain transition-all duration-300" 
                    />
                  )
                ) : (
                  fileType === "video" ? (
                    <video src={previewUrl} controls className="w-full max-h-[500px] object-contain" />
                  ) : (
                    <img src={previewUrl} alt="Preview" className="w-full max-h-[500px] object-contain" />
                  )
                )}

                {/* Nút bật/tắt Depth Vision */}
                {result && result.type === "image" && result.depthData && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-4 right-4 bg-white/90 hover:bg-white shadow-md z-10"
                    onClick={() => setShowDepth(!showDepth)}
                  >
                    {showDepth ? (
                      <><ImageIcon className="w-4 h-4 mr-2"/> Original View</>
                    ) : (
                      <><Eye className="w-4 h-4 mr-2"/> Depth Vision</>
                    )}
                  </Button>
                )}
              </div>
              
              {!result ? (
                <div className="space-y-6">
                  {/* Mode Selection */}
                  <div className="flex flex-col items-center gap-4 p-4 bg-muted/30 rounded-lg border max-w-md mx-auto">
                    <div className="flex items-center gap-3 w-full justify-center">
                      <Label htmlFor="mode-toggle" className={`text-sm font-medium ${!useAutoWeight ? "text-primary" : "text-muted-foreground"}`}>Manual Input</Label>
                      <Switch id="mode-toggle" checked={useAutoWeight} onCheckedChange={setUseAutoWeight} />
                      <Label htmlFor="mode-toggle" className={`text-sm font-medium flex items-center gap-1 ${useAutoWeight ? "text-primary" : "text-muted-foreground"}`}><Wand2 className="h-3.5 w-3.5" /> Auto Estimate</Label>
                    </div>
                    {!useAutoWeight && (
                      <div className="w-full max-w-xs animate-in slide-in-from-top-2 fade-in">
                        <Label htmlFor="weight" className="text-xs text-muted-foreground mb-1.5 block">Total Meal Weight (grams)</Label>
                        <div className="relative">
                          <ScaleIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className="pl-9 h-10" placeholder="e.g. 500" min="1" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 justify-center">
                    <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} className="h-12 px-8 rounded-lg font-semibold min-w-[200px]">
                      {analyzeMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><ImageIcon className="mr-2 h-4 w-4"/> Analyze {fileType === "video" ? "Video" : "Image"}</>}
                    </Button>
                    <Button variant="outline" onClick={handleReset} className="h-12 px-8 rounded-lg font-semibold">Cancel</Button>
                  </div>
                </div>
              ) : (
                <Card className="p-8 rounded-2xl shadow-lg bg-primary/5 animate-in fade-in slide-in-from-bottom-4">
                  <div className="space-y-6">
                    
                    <div className="bg-white p-4 rounded-xl border border-primary/20 shadow-sm flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-primary">Vision Agent</p>
                        <p className="text-sm text-muted-foreground">
                          I detected <b>{result.foodName}</b>. Click on any item below to see its recipe and details.
                        </p>
                      </div>
                    </div>

                    <div className="text-center space-y-4 pt-2">
                      <div className="flex items-center justify-center gap-2">
                        {isEditing ? (
                          <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="text-center text-2xl font-bold h-12 w-64"/>
                        ) : (
                          <h3 className="text-3xl font-bold font-['Poppins']">{editedName}</h3>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)} className="rounded-full hover:bg-muted">
                          {isEditing ? <Check className="h-5 w-5 text-green-600" /> : <Pencil className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </div>

                      {/* Clickable Detections List */}
                      {result.detections && result.detections.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-70">Detected Items (Click to view info)</p>
                          <ul className="flex flex-wrap justify-center gap-2">
                            {result.detections.map((d, i) => (
                              <li 
                                key={i} 
                                className="bg-white px-3 py-1.5 rounded-full shadow-sm border border-border/50 text-xs flex gap-2 items-center cursor-pointer hover:bg-primary/5 hover:border-primary transition-all group"
                                onClick={() => handleRecipeClick(d.class)} 
                              >
                                <span className="font-semibold text-foreground group-hover:text-primary">{d.class}</span>
                                {d.estimated_weight > 0 && <span className="text-muted-foreground">~{d.estimated_weight}g</span>}
                                <InformationCircleIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`text-5xl font-bold ${isEditing ? "text-muted-foreground" : "text-primary"}`}>
                            {editedCalories}
                          </div>
                          <div className="text-lg font-medium text-muted-foreground">kcal</div>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <span>Weight:</span>
                              <Input type="number" value={editedWeight} onChange={(e) => handleWeightChange(e.target.value)} className="w-20 h-8 text-center" />
                              <span>g</span>
                            </div>
                          ) : (
                            <p>Estimated Total: {editedWeight}g</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {showAdvice && (
                      <div className="flex gap-4 p-4 rounded-lg bg-muted/50">
                        <InformationCircleIcon className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                        <div className="space-y-1"><p className="text-sm font-semibold">Personalized Advice</p><p className="text-sm text-muted-foreground leading-relaxed">{personalizedAdvice || result.advice}</p></div>
                      </div>
                    )}

                    <div className="flex gap-4 pt-4">
                      {!showAdvice && (
                        <Button onClick={handleReviewFood} variant="outline" className="flex-1 h-12 rounded-lg font-semibold" disabled={reviewMutation.isPending || addToTrackerMutation.isPending}>
                          {reviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Get Advice"}
                        </Button>
                      )}
                      <Button onClick={() => addToTrackerMutation.mutate()} disabled={addToTrackerMutation.isPending || reviewMutation.isPending} className="flex-1 h-12 rounded-lg font-semibold">
                        {addToTrackerMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirm & Add</> : "Confirm & Add"}
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

      {/* Recipe Detail Dialog */}
      <Dialog open={isRecipeDialogOpen} onOpenChange={setIsRecipeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
          <div className="relative h-32 w-full shrink-0 bg-muted flex items-center justify-center overflow-hidden">
             {result?.annotatedData && (
                <img src={result.annotatedData} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md" alt="" />
             )}
             <DialogTitle className="text-2xl font-bold text-foreground font-['Poppins'] z-10 capitalize">
               {selectedRecipeMeal}
             </DialogTitle>
             <button onClick={() => setIsRecipeDialogOpen(false)} className="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 rounded-full z-20">
                <XIcon className="h-5 w-5" />
             </button>
          </div>

          <ScrollArea className="flex-1 p-6">
            {recipeMutation.isPending || !recipeData ? (
              <div className="space-y-6">
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
                <div className="grid grid-cols-2 gap-4"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" /></div>
                <div className="space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed italic">"{recipeData.description}"</p>
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="px-3 py-1 text-sm flex gap-1 items-center"><Clock className="h-3.5 w-3.5" /> {recipeData.cookingTime}</Badge>
                    <Badge variant="secondary" className="px-3 py-1 text-sm flex gap-1 items-center"><ChefHat className="h-3.5 w-3.5" /> {recipeData.difficulty}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 p-4 rounded-xl bg-muted/30 border border-border/50">
                   <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase font-bold">Calories</p><p className="text-lg font-bold text-primary">{recipeData.macros.calories}</p></div>
                   <div className="text-center border-l"><p className="text-[10px] text-muted-foreground uppercase font-bold">Protein</p><p className="text-lg font-bold">{recipeData.macros.protein}</p></div>
                   <div className="text-center border-l"><p className="text-[10px] text-muted-foreground uppercase font-bold">Carbs</p><p className="text-lg font-bold">{recipeData.macros.carbs}</p></div>
                   <div className="text-center border-l"><p className="text-[10px] text-muted-foreground uppercase font-bold">Fat</p><p className="text-lg font-bold">{recipeData.macros.fat}</p></div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Utensils className="h-4 w-4 text-primary" /> Ingredients</h3>
                    <ul className="space-y-2">{recipeData.ingredients.map((item, i) => (<li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" /><span className="text-muted-foreground">{item}</span></li>))}</ul>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><ChefHat className="h-4 w-4 text-primary" /> Instructions</h3>
                    <div className="space-y-3">{recipeData.instructions.map((step, i) => (<div key={i} className="flex gap-3 text-sm"><span className="font-bold text-primary/60">{i + 1}.</span><p className="text-muted-foreground">{step}</p></div>))}</div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}