import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ChatMessage } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Trash2, Bot, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Chatbot() {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages"],
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/chat/message", { content });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/chat/history");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      toast({
        title: "Success",
        description: "Chat history cleared",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear chat history",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !sendMutation.isPending) {
      sendMutation.mutate(message.trim());
      setMessage("");
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear all chat history?")) {
      clearMutation.mutate();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      const div = scrollRef.current;
      div.scrollTop = div.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  return (
    <div className="container mx-auto max-w-4xl p-4 pt-6 h-[calc(100vh-2rem)]">
      
      {/* [SỬA]: 'bg-white' cho Light mode, 'dark:bg-card' cho Dark mode */}
      <Card className="h-[80vh] flex flex-col shadow-sm bg-white dark:bg-card">
        
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Health & Nutrition Assistant
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearHistory}
            disabled={clearMutation.isPending || messages.length === 0}
            data-testid="button-clear-history"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear History
          </Button>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden pt-0">
          
          <div 
            ref={scrollRef} 
            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading chat history...
              </div>
            ) : messages.length === 0 && !sendMutation.isPending ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Bot className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Welcome to your AI Health Assistant!</h3>
                <p className="text-muted-foreground max-w-md">
                  I'm here to help you with personalized nutrition and fitness advice based on your profile.
                  Ask me anything about calories, diet, exercise, or health!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.role}-${msg.id}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <span className="text-xs opacity-70 mt-1 block">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {msg.role === "user" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {sendMutation.isPending && (
                  <div className="flex gap-3 justify-end animate-in fade-in slide-in-from-bottom-2">
                    <div className="max-w-[80%] rounded-lg p-3 bg-primary text-primary-foreground opacity-70">
                      <p className="text-sm whitespace-pre-wrap">{sendMutation.variables}</p>
                      <span className="text-xs mt-1 block">Sending...</span>
                    </div>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <UserIcon className="h-5 w-5 text-primary-foreground" />
                    </div>
                  </div>
                )}

                {sendMutation.isPending && (
                  <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary animate-pulse" />
                    </div>
                    <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                      <div className="flex space-x-1 h-5 items-center">
                        <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* [SỬA]: Tương tự cho vùng nhập liệu */}
          <div className="p-4 border-t bg-white dark:bg-card">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask me about nutrition, calories, or fitness advice..."
                disabled={sendMutation.isPending}
                className="flex-1"
                data-testid="input-message"
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMutation.isPending}
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}