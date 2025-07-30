import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import apiClient from '../services/apiClient';
import { fileToBase64 } from './FacebookUtils';
import './igBulkComposer.css';
import { useNavigate } from 'react-router-dom';

function IgBulkComposer({ selectedAccount, onClose }) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // Strategy step state
  const [strategyData, setStrategyData] = useState({
    promptTemplate: '',
    customStrategyTemplate: '',
    brandName: '',
    hookIdea: '',
    features: '',
    location: '',
    phone: '',
    website: '',
    callToAction: '',
    imagePrompt: '',
    startDate: '',
    endDate: '',
    frequency: 'daily',
    customCron: '',
    timeSlot: '09:00'
  });

  // Composer grid state
  const [composerRows, setComposerRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [dragStartRow, setDragStartRow] = useState(null);

  // Post type state
  const [postType, setPostType] = useState('photo'); // photo, carousel, reel
  const [carouselImageCount, setCarouselImageCount] = useState(3);

  // Calendar preview state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Queue state
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleProgress, setScheduleProgress] = useState(0);

  // Expanded view state
  const [expandedCaption, setExpandedCaption] = useState(null);
  const [mediaPreviewModal, setMediaPreviewModal] = useState(null);
  const [scheduledGridRows, setScheduledGridRows] = useState([]);
  const navigate = useNavigate();

  // Prompt templates for Instagram
  const [promptTemplates] = useState([
    { id: 1, name: 'Daily Inspiration', prompt: 'Share an inspiring quote or motivational message for your Instagram audience' },
    { id: 2, name: 'Product Showcase', prompt: 'Highlight your best products with engaging descriptions and hashtags' },
    { id: 3, name: 'Behind the Scenes', prompt: 'Share behind-the-scenes content about your business or team' },
    { id: 4, name: 'Customer Spotlight', prompt: 'Feature customer testimonials or success stories' },
    { id: 5, name: 'Industry Tips', prompt: 'Share valuable tips and insights related to your industry' },
    { id: 6, name: 'Lifestyle Content', prompt: 'Share lifestyle content that resonates with your audience' },
    { id: 7, name: 'User Generated Content', prompt: 'Repost and credit amazing content from your community' },
    { id: 8, name: 'Custom', prompt: 'custom' }
  ]);

  const gridRef = useRef(null);
  const carouselInputRefs = useRef({});

  // Initialize composer with default rows
  useEffect(() => {
    if (strategyData.startDate && strategyData.frequency) {
      generateInitialRows();
    }
    // eslint-disable-next-line
  }, [strategyData.startDate, strategyData.endDate, strategyData.frequency, strategyData.timeSlot]);

  const generateInitialRows = () => {
    if (!strategyData.startDate) return;

    const startDateParts = strategyData.startDate.split('-');
    const startDate = new Date(parseInt(startDateParts[0]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[2]));

    let endDate = null;
    if (strategyData.endDate) {
      const endDateParts = strategyData.endDate.split('-');
      endDate = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]));
    }

    const rows = [];
    const maxDays = 30; // Instagram's 30-day limit
    let currentDate = new Date(startDate);
    let dayCount = 0;
    let rowCount = 0;

    if (!endDate) {
      // Format as YYYY-MM-DD using local date parts (same as multi-day logic)
      const yyyy = startDate.getFullYear();
      const mm = String(startDate.getMonth() + 1).padStart(2, '0');
      const dd = String(startDate.getDate()).padStart(2, '0');
      const formattedDate = `${yyyy}-${mm}-${dd}`;
      rows.push({
        id: `row-0`,
        caption: '',
        mediaFile: null,
        mediaPreview: null,
        thumbnailFile: null,
        thumbnailPreview: null,
        postType: postType.toLowerCase(),
        carouselImageCount: carouselImageCount,
        carouselImages: [],
        scheduledDate: formattedDate,
        scheduledTime: strategyData.timeSlot,
        status: 'draft',
        isSelected: false
      });
    } else {
      // Fix: include the end date by using <= in the comparison
      while (dayCount < maxDays && rowCount < 30) {
        if (endDate && currentDate > endDate) break;
        const maxAllowedDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (currentDate > maxAllowedDate) break;

        let shouldInclude = false;
        switch (strategyData.frequency) {
          case 'daily':
            shouldInclude = true;
            break;
          case 'weekly':
            shouldInclude = currentDate.getDay() === startDate.getDay();
            break;
          case 'monthly':
            shouldInclude = currentDate.getDate() === startDate.getDate();
            break;
          case 'custom':
            shouldInclude = true;
            break;
          default:
            shouldInclude = true;
        }

        if (shouldInclude) {
          // Format as YYYY-MM-DD using local date parts
          const yyyy = currentDate.getFullYear();
          const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
          const dd = String(currentDate.getDate()).padStart(2, '0');
          const formattedDate = `${yyyy}-${mm}-${dd}`;
          rows.push({
            id: `row-${rowCount}`,
            caption: '',
            mediaFile: null,
            mediaPreview: null,
            thumbnailFile: null,
            thumbnailPreview: null,
            postType: postType.toLowerCase(),
            carouselImageCount: carouselImageCount,
            carouselImages: [],
            scheduledDate: formattedDate,
            scheduledTime: strategyData.timeSlot,
            status: 'draft',
            isSelected: false
          });
          rowCount++;
        }
        // Fix: increment date at the end, and break if we've reached the end date
        if (endDate && currentDate.getTime() === endDate.getTime()) break;
        currentDate.setDate(currentDate.getDate() + 1);
        dayCount++;
      }
    }
    setComposerRows(rows);
  };

  const handleStrategyChange = (field, value) => {
    setStrategyData(prev => {
      const newData = { ...prev, [field]: value };
      // If start date is changed and end date is before it, clear end date
      if (field === 'startDate' && prev.endDate && value > prev.endDate) {
        newData.endDate = '';
      }
      return newData;
    });

    // If prompt template is selected, apply it to all rows
    if (field === 'promptTemplate' && value && value !== 'custom') {
      setComposerRows(prev =>
        prev.map(row => ({
          ...row,
          caption: value
        }))
      );
    }
  };

  // Update post type for all rows
  const handlePostTypeChange = (newPostType) => {
    setPostType(newPostType);
    setComposerRows(prev =>
      prev.map(row => ({
        ...row,
        postType: newPostType.toLowerCase(),
        carouselImageCount: newPostType === 'carousel' ? carouselImageCount : null,
        carouselImages: newPostType === 'carousel' ? (row.carouselImages || []) : [],
        // Clear media for photo/reel when switching to carousel
        mediaFile: newPostType === 'carousel' ? null : row.mediaFile,
        mediaPreview: newPostType === 'carousel' ? null : row.mediaPreview,
        // Clear thumbnail when switching away from reel
        thumbnailFile: newPostType === 'reel' ? row.thumbnailFile : null,
        thumbnailPreview: newPostType === 'reel' ? row.thumbnailPreview : null
      }))
    );
  };

  // Update carousel image count for all rows
  const handleCarouselImageCountChange = (newCount) => {
    setCarouselImageCount(newCount);
    setComposerRows(prev =>
      prev.map(row => ({
        ...row,
        carouselImageCount: row.postType === 'carousel' ? newCount : row.carouselImageCount
      }))
    );
  };

  const handleRowSelect = (rowId) => {
    setSelectedRows(prev => prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]);
  };

  const handleSelectAll = () => {
    if (selectedRows.length === composerRows.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(composerRows.map(row => row.id));
    }
  };

  const handleCellEdit = (rowId, field, value) => {
    setComposerRows(prev =>
      prev.map(row =>
        row.id === rowId
          ? {
            ...row,
            [field]: field === 'postType' ? value.toLowerCase() : value,
            status: (() => {
              // For carousel posts, check if we have enough images
              if (field === 'postType' && value.toLowerCase() === 'carousel') {
                return 'draft'; // Reset status when switching to carousel
              }

              // For carousel posts, validate image count
              if (row.postType === 'carousel') {
                const hasCaption = (row.caption || '').trim();
                const hasEnoughImages = (row.carouselImages || []).length >= 3;
                return hasCaption && hasEnoughImages ? 'ready' : 'draft';
              }

              // For other post types, use existing logic
              if (field === 'caption' || field === 'mediaFile' || field === 'mediaPreview') {
                const hasCaption = field === 'caption' ? value.trim() : (row.caption || '').trim();
                const hasMedia = field === 'mediaFile' ? value : (row.mediaFile || row.mediaPreview);
                return hasCaption && hasMedia ? 'ready' : 'draft';
              }

              return row.status;
            })()
          }
          : row
      )
    );
  };

  const handleMediaUpload = async (rowId, event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Find the row to determine post type
    const row = composerRows.find(r => r.id === rowId);
    if (!row) return;

    // --- REELS VIDEO UPLOAD LOGIC ---
    if (row.postType === 'reel') {
      alert('Your video is converted to: 1080x1920 as instagram policy.');
      // Proceed to upload to backend as before...
    }

    // --- PHOTO/CAROUSEL LOGIC (unchanged) ---
    const reader = new FileReader();
    reader.onload = (e) => {
      setComposerRows(prev =>
        prev.map(row =>
          row.id === rowId
            ? {
              ...row,
              mediaFile: file,
              mediaPreview: e.target.result,
              status: (row.caption || '').trim() ? 'ready' : 'draft'
            }
            : row
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateMedia = async (rowId) => {
    try {
      const row = composerRows.find(r => r.id === rowId);
      if (!row || !(row.caption || '').trim()) {
        alert('Please add a caption first to generate an image.');
        return;
      }

      console.log(`Generating image for row ${rowId} with caption: ${row.caption.substring(0, 50)}...`);

      // Truncate caption to 500 characters for image generation
      const imagePrompt = row.caption.trim().substring(0, 500);
      console.log(`Using image prompt (truncated): ${imagePrompt.substring(0, 100)}...`);

      const response = await apiClient.generateInstagramImage(imagePrompt, 'feed');

      if (response.success && response.data && response.data.image_url) {
        console.log(`Successfully generated image for row ${rowId}:`, response.data.image_url);
        setComposerRows(prev =>
          prev.map(r =>
            r.id === rowId
              ? {
                ...r,
                mediaFile: null,
                mediaPreview: response.data.image_url,
                status: (r.caption || '').trim() ? 'ready' : 'draft'
              }
              : r
          )
        );
      } else {
        console.log(`Failed to generate image for row ${rowId}:`, response);
        alert('Failed to generate image. Please try again.');
      }
    } catch (error) {
      console.error(`Error generating image for row ${rowId}:`, error);
      alert('Failed to generate image. Please try again.');
    }
  };

  const handleGenerateAllCaptions = async () => {
    if (selectedRows.length === 0) {
      alert('Please select at least one row to generate captions for.');
      return;
    }

    if (!strategyData.promptTemplate) {
      alert('Please select a strategy template first.');
      return;
    }

    setIsScheduling(true);
    setScheduleProgress(0);

    try {
      const selectedComposerRows = composerRows.filter(row => selectedRows.includes(row.id));
      const captions = [];

      // Create the base prompt based on the selected template type
      let prompt = '';

      if (strategyData.promptTemplate === 'custom') {
        // Build a detailed prompt for custom templates
        prompt = `
          Brand Name: ${strategyData.brandName || 'Not specified'}
          Hook Idea: ${strategyData.hookIdea || 'Not specified'}
          Key Features: ${strategyData.features || 'Not specified'}
          Location: ${strategyData.location || 'Not specified'}
          Phone: ${strategyData.phone || 'Not specified'}
          Website: ${strategyData.website || 'Not specified'}
          Call to Action: ${strategyData.callToAction || 'Not specified'}
          Image Prompt: ${strategyData.imagePrompt || 'Not specified'}
          
          Custom Template:
          ${strategyData.customStrategyTemplate || ''}
        `;
      } else {
        // Use the selected predefined template
        const selectedTemplate = promptTemplates.find(t => t.prompt === strategyData.promptTemplate);
        if (!selectedTemplate) {
          alert('Invalid strategy template selected.');
          setIsScheduling(false);
          return;
        }
        prompt = selectedTemplate.prompt;
      }

      // Generate captions for each selected row
      for (let i = 0; i < selectedComposerRows.length; i++) {
        try {
          const row = selectedComposerRows[i];
          const context = {
            scheduledDate: row.scheduledDate,
            // Add any other context you want to include
          };

          // Add context to the prompt
          const fullPrompt = `${prompt}\n\nContext: ${JSON.stringify(context, null, 2)}`;

          const captionResponse = await apiClient.generateInstagramCaption(fullPrompt);

          if (captionResponse.success) {
            captions.push({
              content: captionResponse.content || captionResponse.generated_text || 'No content generated',
              context: context.scheduledDate,
              success: true
            });
          } else {
            console.error('Caption generation failed:', captionResponse.error);
            captions.push({
              content: `Failed to generate caption for: ${context.scheduledDate}`,
              context: context.scheduledDate,
              success: false,
              error: captionResponse.error || 'Unknown error'
            });
          }
        } catch (error) {
          console.error('Error generating caption:', error);
          captions.push({
            content: `Error generating caption for: ${selectedComposerRows[i].scheduledDate}`,
            context: selectedComposerRows[i].scheduledDate,
            success: false,
            error: error.message
          });
        }

        // Update progress
        setScheduleProgress(Math.round(((i + 1) / selectedComposerRows.length) * 100));
      }

      // Update the rows with generated captions
      setComposerRows(prev =>
        prev.map(row => {
          if (!selectedRows.includes(row.id)) return row;

          const caption = captions.find(c => c.context === row.scheduledDate);
          if (caption && caption.success) {
            return {
              ...row,
              caption: caption.content,
              status: 'ready'
            };
          }
          return row;
        })
      );

      // Show success/failure summary
      const successCount = captions.filter(c => c.success).length;
      const failedCount = captions.length - successCount;

      let message = '';
      if (successCount > 0 && failedCount === 0) {
        message = `Successfully generated captions for ${successCount} ${successCount === 1 ? 'post' : 'posts'}.`;
      } else if (successCount > 0) {
        message = `Generated ${successCount} captions successfully, but failed to generate ${failedCount}.`;
      } else {
        message = 'Failed to generate any captions. Please try again.';
      }

      alert(message);
    } catch (error) {
      console.error('Unexpected error in handleGenerateAllCaptions:', error);
      alert('An unexpected error occurred while generating captions. Please try again.');
    } finally {
      setIsScheduling(false);
      setScheduleProgress(0);
    }
  };

  const handleGenerateAllImages = async () => {
    if (selectedRows.length === 0) {
      alert('Please select at least one row to generate images.');
      return;
    }
    setIsScheduling(true);
    setScheduleProgress(0);
    try {
      const selectedComposerRows = composerRows.filter(row => selectedRows.includes(row.id));
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < selectedComposerRows.length; i++) {
        const row = selectedComposerRows[i];

        if (!row.caption || !(row.caption || '').trim()) {
          console.log(`Skipping image generation for row ${row.id} - no caption available`);
          continue;
        }

        try {
          console.log(`Generating image for row ${row.id} with caption: ${row.caption.substring(0, 50)}...`);

          // Truncate caption to 500 characters for image generation
          const imagePrompt = row.caption.trim().substring(0, 500);
          console.log(`Using image prompt (truncated): ${imagePrompt.substring(0, 100)}...`);

          // Generate image using Stability AI with the caption as prompt
          const response = await apiClient.generateInstagramImage(imagePrompt, 'feed');

          if (response.success && response.data && response.data.image_url) {
            console.log(`Successfully generated image for row ${row.id}:`, response.data.image_url);
            setComposerRows(prev =>
              prev.map(r =>
                r.id === row.id
                  ? {
                    ...r,
                    mediaFile: null,
                    mediaPreview: response.data.image_url,
                    status: (r.caption || '').trim() ? 'ready' : 'draft'
                  }
                  : r
              )
            );
            successCount++;
          } else {
            console.log(`Failed to generate image for row ${row.id}:`, response);
            errorCount++;
          }
        } catch (error) {
          console.error(`Error generating image for row ${row.id}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        alert(`Image generation completed! Successfully generated ${successCount} images${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      } else {
        alert('Failed to generate any images. Please try again.');
      }
    } catch (error) {
      console.error('Error in bulk image generation:', error);
      alert('Failed to generate images. Please try again.');
    } finally {
      setIsScheduling(false);
      setScheduleProgress(0);
    }
  };

  const handleExpandCaption = (rowId) => {
    const row = composerRows.find(r => r.id === rowId);
    if (row) setExpandedCaption(row);
  };

  const handleViewMedia = (rowId) => {
    const row = composerRows.find(r => r.id === rowId);
    if (row && (row.mediaPreview || row.mediaFile)) setMediaPreviewModal(row);
  };

  const handleSaveExpandedCaption = (rowId, newCaption) => {
    setComposerRows(prev =>
      prev.map(row =>
        row.id === rowId
          ? { ...row, caption: newCaption, status: ((newCaption || '').trim() && (row.mediaFile || row.mediaPreview)) ? 'ready' : 'draft' }
          : row
      )
    );
    setExpandedCaption(null);
  };

  const handleThumbnailUpload = async (rowId, event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file for the thumbnail.');
      return;
    }

    // Show loading state
    setComposerRows(prev =>
      prev.map(row =>
        row.id === rowId
          ? {
            ...row,
            thumbnailUploading: true
          }
          : row
      )
    );

    try {
      console.log(`📤 Uploading thumbnail for row ${rowId}: ${file.name}`);

      // Upload thumbnail to Cloudinary via backend
      const uploadResponse = await apiClient.uploadThumbnailToCloudinary(file);

      if (uploadResponse && uploadResponse.success && uploadResponse.data && uploadResponse.data.url) {
        console.log(`✅ Thumbnail uploaded successfully: ${uploadResponse.data.url}`);

        // Update row with Cloudinary URL
        setComposerRows(prev =>
          prev.map(row =>
            row.id === rowId
              ? {
                ...row,
                thumbnailFile: null, // Clear file since we have URL now
                thumbnailPreview: uploadResponse.data.url, // Use Cloudinary URL
                thumbnailUrl: uploadResponse.data.url, // Store Cloudinary URL
                thumbnailUploading: false
              }
              : row
          )
        );

        alert('Thumbnail uploaded successfully! It will be optimized for Instagram reel cover image requirements.');
      } else {
        console.error(`❌ Failed to upload thumbnail:`, uploadResponse);
        alert('Failed to upload thumbnail. Please try again.');

        // Clear loading state
        setComposerRows(prev =>
          prev.map(row =>
            row.id === rowId
              ? {
                ...row,
                thumbnailUploading: false
              }
              : row
          )
        );
      }
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      alert(`Failed to upload thumbnail: ${error.message}`);

      // Clear loading state
      setComposerRows(prev =>
        prev.map(row =>
          row.id === rowId
            ? {
              ...row,
              thumbnailUploading: false
            }
            : row
        )
      );
    }
  };

  const handleRemoveThumbnail = (rowId) => {
    setComposerRows(prev =>
      prev.map(row =>
        row.id === rowId ? {
          ...row,
          thumbnailFile: null,
          thumbnailPreview: null,
          thumbnailUrl: null // Clear Cloudinary URL as well
        } : row
      )
    );
  };

  const handleRemoveMedia = (rowId) => {
    setComposerRows(prev =>
      prev.map(row =>
        row.id === rowId ? {
          ...row,
          mediaFile: null,
          mediaPreview: null,
          thumbnailFile: null,
          thumbnailPreview: null,
          carouselImages: row.postType === 'carousel' ? [] : null,
          status: (row.caption || '').trim() ? 'draft' : 'draft'
        } : row
      )
    );
  };

  const handleGenerateCarousel = async (rowId) => {
    try {
      const row = composerRows.find(r => r.id === rowId);
      if (!row || !(row.caption || '').trim()) {
        alert('Please add a caption first to generate carousel images.');
        return;
      }

      console.log(`Generating carousel for row ${rowId} with caption: ${row.caption.substring(0, 50)}...`);

      const imagePrompt = row.caption.trim().substring(0, 500);
      const imageCount = row.carouselImageCount || 3;

      if (imageCount < 3 || imageCount > 7) {
        alert('Carousel must have between 3 and 7 images.');
        return;
      }

      console.log(`🎨 Generating ${imageCount} carousel images with prompt: ${imagePrompt}`);

      const response = await apiClient.generateInstagramCarousel(imagePrompt, imageCount);

      if (response.success && response.image_urls && response.image_urls.length >= 3) {
        console.log(`Successfully generated carousel for row ${rowId}:`, response.image_urls);
        setComposerRows(prev =>
          prev.map(r =>
            r.id === rowId
              ? {
                ...r,
                carouselImages: response.image_urls,
                status: (() => {
                  const hasCaption = (r.caption || '').trim();
                  const hasEnoughImages = response.image_urls.length >= 3;
                  return hasCaption && hasEnoughImages ? 'ready' : 'draft';
                })()
              }
              : r
          )
        );
      } else {
        console.log(`Failed to generate carousel for row ${rowId}:`, response);
        const errorMsg = response.error || 'Failed to generate enough carousel images. Please try again.';
        alert(`Failed to generate carousel: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`Error generating carousel for row ${rowId}:`, error);
      alert('Error generating carousel images. Please try again.');
    }
  };

  const handleCarouselUpload = async (rowId, event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const row = composerRows.find(r => r.id === rowId);
    const maxImages = row.carouselImageCount || 3;
    const minImages = 3;

    if (files.length < minImages) {
      alert(`Please select at least ${minImages} images for a carousel post.`);
      return;
    }

    if (files.length > maxImages) {
      alert(`Please select only ${maxImages} images for this carousel.`);
      return;
    }

    try {
      console.log(`🖼️ Uploading ${files.length} carousel images for row ${rowId}`);

      const imageUrls = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert(`File ${file.name} is not an image. Please select only image files.`);
          continue;
        }

        console.log(`📤 Uploading carousel image ${i + 1}/${files.length}: ${file.name}`);

        // Upload to Cloudinary
        const uploadResponse = await apiClient.uploadImageToCloudinary(file);

        if (uploadResponse && uploadResponse.success && uploadResponse.data && uploadResponse.data.url) {
          imageUrls.push(uploadResponse.data.url);
          console.log(`✅ Carousel image ${i + 1} uploaded: ${uploadResponse.data.url}`);
        } else {
          console.error(`❌ Failed to upload carousel image ${i + 1}:`, uploadResponse);
          alert(`Failed to upload image ${file.name}. Please try again.`);
          return;
        }
      }

      if (imageUrls.length >= minImages) {
        setComposerRows(prev =>
          prev.map(r =>
            r.id === rowId
              ? {
                ...r,
                carouselImages: imageUrls,
                status: (() => {
                  const hasCaption = (r.caption || '').trim();
                  const hasEnoughImages = imageUrls.length >= 3;
                  return hasCaption && hasEnoughImages ? 'ready' : 'draft';
                })()
              }
              : r
          )
        );
        console.log(`✅ Successfully uploaded ${imageUrls.length} carousel images for row ${rowId}`);
      } else {
        alert(`Please upload at least ${minImages} images for a carousel post.`);
      }

      // Clear the file input
      if (carouselInputRefs.current[rowId]) {
        carouselInputRefs.current[rowId].value = '';
      }
    } catch (error) {
      console.error('Error processing carousel upload:', error);
      alert('Error uploading carousel images. Please try again.');
    }
  };

  const handleDuplicateRow = (rowId) => {
    const rowToDuplicate = composerRows.find(row => row.id === rowId);
    if (rowToDuplicate) {
      const newRow = {
        ...rowToDuplicate,
        id: `row-${Date.now()}-${Math.random()}`,
        scheduledDate: new Date(rowToDuplicate.scheduledDate).toISOString().split('T')[0],
        postType: rowToDuplicate.postType ? rowToDuplicate.postType.toLowerCase() : 'photo'
      };
      setComposerRows(prev => [...prev, newRow]);
    }
  };

  const handleDeleteRow = (rowId) => {
    setComposerRows(prev => prev.filter(row => row.id !== rowId));
    setSelectedRows(prev => prev.filter(id => id !== rowId));
  };

  const handleBulkDelete = () => {
    setComposerRows(prev => prev.filter(row => !selectedRows.includes(row.id)));
    setSelectedRows([]);
  };

  const handleTimeShift = (direction) => {
    setComposerRows(prev =>
      prev.map(row => {
        if (selectedRows.includes(row.id)) {
          const [hours, minutes] = row.scheduledTime.split(':');
          let newHours = parseInt(hours) + (direction === 'forward' ? 1 : -1);
          if (newHours < 0) newHours = 23;
          if (newHours > 23) newHours = 0;
          return {
            ...row,
            scheduledTime: `${newHours.toString().padStart(2, '0')}:${minutes}`
          };
        }
        return row;
      })
    );
  };

  const handleDragStart = (rowId) => setDragStartRow(rowId);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (targetRowId) => {
    if (dragStartRow && dragStartRow !== targetRowId) {
      const rows = [...composerRows];
      const sourceIndex = rows.findIndex(row => row.id === dragStartRow);
      const targetIndex = rows.findIndex(row => row.id === targetRowId);
      const [movedRow] = rows.splice(sourceIndex, 1);
      rows.splice(targetIndex, 0, movedRow);
      setComposerRows(rows);
    }
    setDragStartRow(null);
  };

  const handleScheduleAll = async () => {
    if (!selectedAccount || composerRows.length === 0) return;
    setIsScheduling(true);
    setScheduleProgress(0);

    try {
      const readyRows = composerRows.filter(row => row.status === 'ready');
      console.log(`🔄 Starting bulk scheduling for ${readyRows.length} posts...`);

      // Progress tracking for media processing
      let processedCount = 0;
      const totalPosts = readyRows.length;

      const postsWithMedia = await Promise.all(
        readyRows.map(async (row, index) => {
          const basePost = {
            caption: row.caption,
            scheduled_datetime: `${row.scheduledDate}T${row.scheduledTime}:00+05:30`,
            scheduled_date: row.scheduledDate,
            scheduled_time: row.scheduledTime,
            post_type: (row.postType || 'photo').toLowerCase()
          };

          if (row.postType === 'photo') {
            if (row.mediaFile) {
              const result = {
                ...basePost,
                media_file: await fileToBase64(row.mediaFile),
                media_filename: row.mediaFile.name
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else if (row.mediaPreview && row.mediaPreview.startsWith('data:')) {
              const result = {
                ...basePost,
                media_file: row.mediaPreview,
                media_filename: 'generated_image.jpg'
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else if (row.mediaPreview && row.mediaPreview.startsWith('http')) {
              const result = {
                ...basePost,
                image_prompt: row.caption.substring(0, 200)
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else {
              const result = {
                ...basePost,
                image_prompt: strategyData.imagePrompt || row.caption.substring(0, 200)
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            }
          } else if (row.postType === 'carousel') {
            if (row.carouselImages && row.carouselImages.length > 0) {
              const carouselFiles = row.carouselImages;
              const result = {
                ...basePost,
                carousel_images: carouselFiles,
                carousel_filenames: carouselFiles.map((_, idx) => `carousel_image_${idx + 1}.jpg`)
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else {
              const result = {
                ...basePost,
                carousel_image_count: row.carouselImageCount || 3,
                image_prompt: strategyData.imagePrompt || row.caption.substring(0, 200)
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            }
          } else if (row.postType === 'reel') {
            if (row.mediaFile) {
              const result = {
                ...basePost,
                media_file: await fileToBase64(row.mediaFile),
                media_filename: row.mediaFile.name
              };

              // Add thumbnail if available - prioritize Cloudinary URL over file
              if (row.thumbnailUrl && row.thumbnailUrl.startsWith('http')) {
                result.thumbnail_url = row.thumbnailUrl;
              } else if (row.thumbnailPreview && row.thumbnailPreview.startsWith('http')) {
                result.thumbnail_url = row.thumbnailPreview;
              } else if (row.thumbnailFile) {
                result.thumbnail_file = await fileToBase64(row.thumbnailFile);
                result.thumbnail_filename = row.thumbnailFile.name;
              }

              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else if (row.mediaPreview && row.mediaPreview.startsWith('data:')) {
              const result = {
                ...basePost,
                media_file: row.mediaPreview,
                media_filename: 'generated_video.mp4'
              };

              // Add thumbnail if available - prioritize Cloudinary URL over file
              if (row.thumbnailUrl && row.thumbnailUrl.startsWith('http')) {
                result.thumbnail_url = row.thumbnailUrl;
              } else if (row.thumbnailPreview && row.thumbnailPreview.startsWith('http')) {
                result.thumbnail_url = row.thumbnailPreview;
              } else if (row.thumbnailFile) {
                result.thumbnail_file = await fileToBase64(row.thumbnailFile);
                result.thumbnail_filename = row.thumbnailFile.name;
              }

              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            } else {
              const result = {
                ...basePost,
                image_prompt: strategyData.imagePrompt || row.caption.substring(0, 200)
              };
              processedCount++;
              setScheduleProgress((processedCount / totalPosts) * 30);
              return result;
            }
          }

          processedCount++;
          setScheduleProgress((processedCount / totalPosts) * 30);
          return basePost;
        })
      );

      // Final normalization: ensure all outgoing post_type values are lowercase
      const normalizedPostsWithMedia = postsWithMedia.map(post => ({
        ...post,
        post_type: (post.post_type || 'photo').toLowerCase()
      }));

      const bulkData = {
        social_account_id: selectedAccount.id,
        posts: normalizedPostsWithMedia
      };

      console.log(`🚀 Sending ${normalizedPostsWithMedia.length} posts to backend for scheduling...`);
      setScheduleProgress(40); // 40% for API call start

      const response = await apiClient.bulkScheduleInstagramPosts(bulkData);
      setScheduleProgress(90); // 90% for API response
      console.log('Bulk schedule response:', response);
      if (response && response.success) {
        console.log(`✅ Successfully scheduled ${response.scheduled_posts?.length || 0} posts`);
        setComposerRows(prev =>
          prev.map(row =>
            readyRows.some(r => r.id === row.id) ? { ...row, status: 'scheduled' } : row
          )
        );
        setScheduleProgress(100);
        setScheduledGridRows(response.scheduled_posts || []);
        // Redirect to InstagramPage with scheduled posts for grid display
        navigate('/instagram', { state: { scheduledGridRows: response.scheduled_posts || [] } });
      } else if (response && Array.isArray(response.results)) {
        // Handle legacy or alternate backend response
        const successCount = response.results.filter(r => r.success).length;
        const failedCount = response.results.filter(r => !r.success).length;
        let errorMsg = `Scheduled ${successCount} posts successfully.`;
        if (failedCount > 0) {
          errorMsg += `\n${failedCount} posts failed. Check console for details.`;
          response.results.forEach((result, idx) => {
            if (!result.success) {
              errorMsg += `\nPost #${idx + 1}: ${result.error || result.message || 'Unknown error'}`;
            }
          });
        }
        alert(errorMsg);
        
        // Add success notification for Instagram bulk scheduling
        if (successCount > 0) {
          const selectedTemplate = promptTemplates.find(t => t.prompt === strategyData.promptTemplate);
          const strategyName = selectedTemplate ? selectedTemplate.name : 'Bulk Schedule';
          
          addNotification({
            type: 'success',
            platform: 'instagram',
            strategyName: strategyName,
            message: `Successfully scheduled ${successCount} Instagram posts! You'll receive alerts 10 minutes before each post goes live.`
          });
        }
        setComposerRows(prev =>
          prev.map(row => {
            const result = response.results.find(r => r.caption === row.caption && r.scheduled_date === row.scheduledDate);
            if (result) {
              return {
                ...row,
                status: result.success ? 'scheduled' : 'failed',
                error: result.success ? null : (result.error || 'Unknown error')
              };
            }
            return row;
          })
        );
        setScheduleProgress(100);
        setScheduledGridRows(response.results.filter(r => r.success));
        navigate('/instagram', { state: { scheduledGridRows: response.results.filter(r => r.success) } });
      } else {
        let errorMsg = 'Error scheduling Instagram posts.';
        if (response && response.failed_posts && response.failed_posts.length > 0) {
          errorMsg += '\nFailed posts:';
          response.failed_posts.forEach(fp => {
            errorMsg += `\nPost #${fp.index + 1}: ${fp.error}`;
          });
        } else if (response && response.message) {
          errorMsg += `\n${response.message}`;
        } else if (response && response.errorData) {
          errorMsg += `\nAPI Error: ${JSON.stringify(response.errorData)}`;
        }
        alert(errorMsg);
        console.error('Bulk scheduling error:', response);
      }
    } catch (error) {
      let errorMsg = 'Error scheduling Instagram posts. Please try again.';
      // Check if any of the readyRows are reels
      const hasReel = composerRows.filter(row => selectedRows.includes(row.id)).some(row => (row.postType || '').toLowerCase() === 'reel');
      if (error && error.error === 'timeout') {
        if (hasReel) {
          errorMsg = 'Your reel is being processed and will be scheduled soon. Please check back in a few minutes.';
        } else {
          errorMsg = 'Request timed out. Video processing may take longer. Please try again or check your video file size.';
        }
      } else if (error && error.errorData) {
        errorMsg += `\nAPI Error: ${JSON.stringify(error.errorData)}`;
      } else if (error && error.message) {
        errorMsg += `\n${error.message}`;
      }
      alert(errorMsg);
      console.error('Bulk scheduling exception:', error);
    } finally {
      setIsScheduling(false);
      setScheduleProgress(0);
    }
  };

  // Calendar day click logic
  const handleCalendarDateSelect = (date) => {
    setStrategyData(prev => ({
      ...prev,
      startDate: date.toISOString().split('T')[0]
    }));
  };

  // UI helpers
  const getStatusIcon = (status) => {
    switch (status) {
      case 'published': return '✓';
      case 'failed': return '✗';
      case 'scheduled': return '⏰';
      case 'ready': return '🟢';
      default: return '📝';
    }
  };
  const getStatusClass = (status) => {
    switch (status) {
      case 'published': return 'ig-status-published';
      case 'failed': return 'ig-status-failed';
      case 'scheduled': return 'ig-status-scheduled';
      case 'ready': return 'ig-status-ready';
      default: return 'ig-status-draft';
    }
  };

  // Calendar helpers
  const generateCalendarDays = (year, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push({ day: null, date: null });
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({ day: i, date });
    }
    return days;
  };
  const getPostsForDate = (date) => {
    // Format date as YYYY-MM-DD using local date parts
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;
    return composerRows.filter(row => row.scheduledDate === dateString);
  };

  const handleRemoveCarouselImages = (rowId) => {
    setComposerRows(prev =>
      prev.map(r =>
        r.id === rowId
          ? {
            ...r,
            carouselImages: [],
            status: 'draft' // Always reset to draft when removing images
          }
          : r
      )
    );
    console.log(`🗑️ Removed carousel images for row ${rowId}`);
  };

  // --- RENDER ---
  return (
    <div className="ig-bulk-composer">
      <div className="ig-bulk-composer-header">
        <h2>Instagram Bulk Composer</h2>
      </div>

      <div className="ig-bulk-composer-content">
        {/* Strategy Step */}
        <div className="ig-strategy-step">
          <h3>Step 1: Strategy & Schedule</h3>
          <div className="ig-strategy-form">

            {/* Post Type Selection */}
            <div className="ig-form-group">
              <label>Post Type</label>
              <div className="ig-post-type-toggle">
                <button
                  className={postType === 'photo' ? 'active' : ''}
                  onClick={() => handlePostTypeChange('photo')}
                >
                  📸 Photo
                </button>
                <button
                  className={postType === 'carousel' ? 'active' : ''}
                  onClick={() => handlePostTypeChange('carousel')}
                >
                  🖼️ Carousel
                </button>
                <button
                  className={postType === 'reel' ? 'active' : ''}
                  onClick={() => handlePostTypeChange('reel')}
                >
                  🎬 Reel
                </button>
              </div>

              {/* Carousel Image Count */}
              {postType === 'carousel' && (
                <div className="ig-form-group">
                  <label>Number of Images: {carouselImageCount}</label>
                  <input
                    type="range"
                    min="3"
                    max="7"
                    value={carouselImageCount}
                    onChange={(e) => handleCarouselImageCountChange(parseInt(e.target.value))}
                    className="ig-slider"
                  />
                  <div className="ig-slider-labels">
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                    <span>7</span>
                  </div>
                </div>
              )}

              {/* AI Image Prompt */}

            </div>
            <div className="ig-form-group">
              <label>Strategy Template</label>
              <select
                value={strategyData.promptTemplate}
                onChange={(e) => handleStrategyChange('promptTemplate', e.target.value)}
                className="ig-form-select"
              >
                <option value="">Select a template...</option>
                {promptTemplates.map(template => (
                  <option key={template.id} value={template.prompt}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            {strategyData.promptTemplate === 'custom' && (
              <div className="ig-form-group">
                <label>Brand Information</label>
                <div className="ig-form-row">
                  <div className="ig-form-group">
                    <input
                      type="text"
                      value={strategyData.brandName}
                      onChange={(e) => handleStrategyChange('brandName', e.target.value)}
                      placeholder="Brand Name"
                      className="ig-form-input"
                    />
                  </div>
                  <div className="ig-form-group">
                    <input
                      type="text"
                      value={strategyData.hookIdea}
                      onChange={(e) => handleStrategyChange('hookIdea', e.target.value)}
                      placeholder="Hook Idea (e.g., Tired of the shore?)"
                      className="ig-form-input"
                    />
                  </div>
                </div>

                <div className="ig-form-group">
                  <label>Features (one per line)</label>
                  <textarea
                    value={strategyData.features}
                    onChange={(e) => handleStrategyChange('features', e.target.value)}
                    placeholder="✅ Feature 1\n✅ Feature 2\n✅ Feature 3"
                    className="ig-form-input"
                    rows="3"
                  />
                </div>

                <div className="ig-form-row">
                  <div className="ig-form-group">
                    <input
                      type="text"
                      value={strategyData.location}
                      onChange={(e) => handleStrategyChange('location', e.target.value)}
                      placeholder="Location"
                      className="ig-form-input"
                    />
                  </div>
                  <div className="ig-form-group">
                    <input
                      type="text"
                      value={strategyData.phone}
                      onChange={(e) => handleStrategyChange('phone', e.target.value)}
                      placeholder="Phone Number"
                      className="ig-form-input"
                    />
                  </div>
                </div>

                <div className="ig-form-group">
                  <input
                    type="text"
                    value={strategyData.website}
                    onChange={(e) => handleStrategyChange('website', e.target.value)}
                    placeholder="Website URL"
                    className="ig-form-input"
                  />
                </div>

                <div className="ig-form-group">
                  <textarea
                    value={strategyData.callToAction}
                    onChange={(e) => handleStrategyChange('callToAction', e.target.value)}
                    placeholder="Call to Action (e.g., Book your appointment today!)"
                    className="ig-form-input"
                    rows="2"
                  />
                </div>

                <small className="ig-form-help">
                  This information will be used to generate captions that follow your brand's style and approach.
                </small>
              </div>
            )}
            <div className="ig-form-row">
              <div className="ig-form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={strategyData.startDate}
                  onChange={(e) => handleStrategyChange('startDate', e.target.value)}
                  className="ig-form-input"
                />
              </div>
              <div className="ig-form-group">
                <label>End Date (Optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="date"
                    value={strategyData.endDate}
                    onChange={(e) => handleStrategyChange('endDate', e.target.value)}
                    className="ig-form-input"
                    min={strategyData.startDate}
                    disabled={!strategyData.startDate}
                  />
                  <button
                    type="button"
                    onClick={() => handleStrategyChange('endDate', '')}
                    className="ig-btn ig-btn-secondary ig-btn-small"
                    disabled={!strategyData.endDate}
                    title="Clear end date (single day schedule)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Clear
                  </button>
                </div>
                <small className="ig-form-help">
                  Leave empty for single day schedule
                </small>
              </div>
              <div className="ig-form-group">
                <label>Frequency</label>
                <select
                  value={strategyData.frequency}
                  onChange={(e) => handleStrategyChange('frequency', e.target.value)}
                  className="ig-form-select"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom Cron</option>
                </select>
              </div>
              <div className="ig-form-group">
                <label>Time Slot</label>
                <input
                  type="time"
                  value={strategyData.timeSlot}
                  onChange={(e) => handleStrategyChange('timeSlot', e.target.value)}
                  className="ig-form-input"
                />
              </div>
            </div>
            {strategyData.frequency === 'custom' && (
              <div className="ig-form-group">
                <label>Custom Cron Expression</label>
                <input
                  type="text"
                  value={strategyData.customCron}
                  onChange={(e) => handleStrategyChange('customCron', e.target.value)}
                  placeholder="0 9 * * * (daily at 9 AM)"
                  className="ig-form-input"
                />
              </div>
            )}
          </div>
        </div>

        {/* Calendar Preview */}
        <div className="ig-calendar-preview-section">
          <h3>Calendar Preview</h3>
          <div className="ig-calendar-container">
            <div className="ig-calendar-header">
              <button
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
                className="ig-btn ig-btn-secondary ig-btn-small"
              >
                ←
              </button>
              <h4>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
              <button
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
                className="ig-btn ig-btn-secondary ig-btn-small"
              >
                →
              </button>
            </div>
            <div className="ig-calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="ig-calendar-day-header">{day}</div>
              ))}
              {generateCalendarDays(currentMonth.getFullYear(), currentMonth.getMonth()).map((day, index) => (
                <div
                  key={index}
                  className={`ig-calendar-day ${day.date ? 'clickable' : ''} ${day.date && getPostsForDate(day.date).length > 0 ? 'has-posts' : ''}`}
                  onClick={() => day.date && handleCalendarDateSelect(day.date)}
                >
                  <span className="ig-day-number">{day.day}</span>
                  {day.date && getPostsForDate(day.date).length > 0 && (
                    <div className="ig-post-indicators">
                      {getPostsForDate(day.date).map((post, postIndex) => (
                        <div
                          key={postIndex}
                          className="ig-post-dot"
                          title={`${post.scheduledTime} - ${(post.caption || '').substring(0, 30)}...`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Composer Grid */}
        <div className="ig-composer-grid-section">
          <div className="ig-composer-header">
            <h3>Step 2: Content Grid</h3>
            <div className="ig-composer-controls">
              <button
                onClick={() => {
                  const newRow = {
                    id: `row-${Date.now()}-${Math.random()}`,
                    caption: '',
                    postType: postType.toLowerCase(),
                    mediaFile: null,
                    mediaPreview: null,
                    carouselImages: postType === 'carousel' ? [] : null,
                    carouselImageCount: postType === 'carousel' ? carouselImageCount : null,
                    scheduledDate: new Date().toISOString().split('T')[0],
                    scheduledTime: strategyData.timeSlot,
                    status: 'draft',
                    isSelected: false
                  };
                  setComposerRows(prev => [...prev, newRow]);
                }}
                className="ig-btn ig-btn-primary ig-btn-small"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Row
              </button>
              <button
                onClick={handleSelectAll}
                className="ig-btn ig-btn-secondary ig-btn-small"
              >
                {selectedRows.length === composerRows.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedRows.length === 0}
                className="ig-btn ig-btn-danger ig-btn-small"
              >
                Delete Selected
              </button>
              <button
                className="ig-btn ig-btn-primary"
                onClick={handleGenerateAllCaptions}
                disabled={composerRows.length === 0 || selectedRows.length === 0}
              >
                Generate Captions
              </button>
              <button
                className="ig-btn ig-btn-secondary"
                onClick={handleGenerateAllImages}
                disabled={composerRows.length === 0 || selectedRows.length === 0}
              >
                Generate Images
              </button>
              <div className="ig-time-shift-controls">
                <button
                  onClick={() => handleTimeShift('backward')}
                  disabled={selectedRows.length === 0}
                  className="ig-btn ig-btn-secondary ig-btn-small"
                >
                  ← -1h
                </button>
                <button
                  onClick={() => handleTimeShift('forward')}
                  disabled={selectedRows.length === 0}
                  className="ig-btn ig-btn-secondary ig-btn-small"
                >
                  +1h →
                </button>
              </div>
            </div>
          </div>

          <div className="ig-composer-grid-container">
            <div className="ig-composer-grid" ref={gridRef}>
              <div className="ig-grid-header ig-grid-row">
                <div className="ig-grid-cell ig-header-cell"></div>
                <div className="ig-grid-cell ig-header-cell">Caption</div>
                <div className="ig-grid-cell ig-header-cell">Media</div>
                <div className="ig-grid-cell ig-header-cell">Date</div>
                <div className="ig-grid-cell ig-header-cell">Time</div>
                <div className="ig-grid-cell ig-header-cell">Status</div>
              </div>
              <div className="ig-grid-body">
                {composerRows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`ig-grid-row ${row.isSelected ? 'selected' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(row.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(row.id)}
                  >
                    <div className="ig-grid-cell">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row.id)}
                        onChange={() => handleRowSelect(row.id)}
                      />
                    </div>
                    <div className="ig-grid-cell ig-caption-cell">
                      <div className="caption-container">
                        <textarea
                          value={row.caption}
                          onChange={(e) => handleCellEdit(row.id, 'caption', e.target.value)}
                          placeholder="Enter your Instagram post caption..."
                          className="ig-caption-input"
                          rows="3"
                        />
                        <button
                          onClick={() => handleExpandCaption(row.id)}
                          className="expand-btn"
                          title="Expand caption"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 3h6v6" />
                            <path d="M9 21H3v-6" />
                            <path d="M21 3l-7 7" />
                            <path d="M3 21l7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="ig-grid-cell ig-media-cell">
                      <div className="ig-media-options">
                        {/* Show upload options when no media is uploaded yet */}
                        {!row.mediaPreview && !row.mediaFile && (!row.carouselImages || row.carouselImages.length === 0) ? (
                          <div className="ig-media-option-group">
                            {/* Photo/Reel Upload */}
                            {(row.postType === 'photo' || row.postType === 'reel') && (
                              <>
                                <input
                                  type="file"
                                  accept={row.postType === 'photo' ? "image/*" : "video/*"}
                                  onChange={(e) => handleMediaUpload(row.id, e)}
                                  className="ig-media-input"
                                  id={`ig-media-upload-${row.id}`}
                                />
                                <label htmlFor={`ig-media-upload-${row.id}`} className="ig-media-option-btn upload-btn">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7,10 12,15 17,10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Upload {row.postType === 'photo' ? 'Image' : 'Video'}
                                </label>
                              </>
                            )}

                            {/* Disabled Thumbnail Upload for Reels (Video Required First) */}
                            {row.postType === 'reel' && (
                              <div className="ig-media-option-btn upload-btn thumbnail-btn disabled" title="Please upload a video first">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <polyline points="21,15 16,10 5,21" />
                                </svg>
                                Upload Thumbnail (Video Required First)
                              </div>
                            )}

                            {/* AI Generation for Photo */}
                            {row.postType === 'photo' && (
                              <button
                                onClick={() => handleGenerateMedia(row.id)}
                                className="ig-media-option-btn generate-btn"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                Generate
                              </button>
                            )}

                            {/* AI Generation for Reel */}
                            {row.postType === 'reel' && (
                              <button
                                onClick={() => handleGenerateMedia(row.id)}
                                className="ig-media-option-btn generate-btn"
                                disabled={true}
                                title="AI video generation not yet available"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                Generate (Coming Soon)
                              </button>
                            )}

                            {/* Carousel Options */}
                            {row.postType === 'carousel' && (
                              <>
                                <button
                                  onClick={() => handleGenerateCarousel(row.id)}
                                  className="ig-media-option-btn generate-btn"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                  </svg>
                                  Generate {row.carouselImageCount || 3} Images
                                </button>
                                <input
                                  key={`ig-carousel-upload-${row.id}`}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  ref={el => carouselInputRefs.current[row.id] = el}
                                  onChange={(e) => handleCarouselUpload(row.id, e)}
                                  className="ig-media-input"
                                  id={`ig-carousel-upload-${row.id}`}
                                />
                                <label htmlFor={`ig-carousel-upload-${row.id}`} className="ig-media-option-btn upload-btn">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7,10 12,15 17,10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Upload {row.carouselImageCount || 3} Images
                                </label>
                              </>
                            )}
                          </div>
                        ) : (
                          /* Show media preview and additional options after upload */
                          <div className="ig-media-preview-container">
                            {/* Thumbnail Upload for Reels - ONLY show after video is uploaded */}
                            {row.postType === 'reel' && (row.mediaPreview || row.mediaFile) && (
                              <div className="ig-reel-thumbnail-upload-section">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleThumbnailUpload(row.id, e)}
                                  className="ig-media-input"
                                  id={`ig-thumbnail-upload-${row.id}`}
                                  disabled={row.thumbnailUploading}
                                />
                                <label
                                  htmlFor={`ig-thumbnail-upload-${row.id}`}
                                  className={`ig-media-option-btn upload-btn thumbnail-btn ${row.thumbnailUploading ? 'uploading' : ''}`}
                                >
                                  {row.thumbnailUploading ? (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                                      </svg>
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21,15 16,10 5,21" />
                                      </svg>
                                      {row.thumbnailPreview ? 'Change Thumbnail' : 'Upload Thumbnail (Optional)'}
                                    </>
                                  )}
                                </label>
                              </div>
                            )}
                            
                            {/* Media Preview */}
                            <div className="ig-media-preview">
                              {/* Carousel Preview */}
                              {row.postType === 'carousel' && row.carouselImages && row.carouselImages.length > 0 ? (
                                <div className="ig-carousel-preview">
                                  <div className="ig-carousel-grid">
                                    {row.carouselImages.slice(0, row.carouselImageCount || 3).map((url, index) => (
                                      <div key={index} className="ig-carousel-item">
                                        <img src={url} alt={`Carousel ${index + 1}`} />
                                        <span className="ig-carousel-number">{index + 1}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="ig-carousel-info">
                                    <div className="ig-carousel-status">
                                      {row.carouselImages.length} / {row.carouselImageCount || 3} images
                                      {row.carouselImages.length < 3 && (
                                        <span className="ig-carousel-warning">⚠️ Need at least 3 images</span>
                                      )}
                                      {row.carouselImages.length >= 3 && (
                                        <span className="ig-carousel-success">✅ Ready</span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleRemoveCarouselImages(row.id)}
                                      className="ig-btn ig-btn-danger ig-btn-small"
                                      disabled={row.carouselImages.length === 0}
                                      title="Remove all carousel images"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                      Remove All
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* Single Media Preview */
                                <>
                                  {row.postType === 'reel' ? (
                                    <div className="ig-reel-preview">
                                      <div className="ig-reel-video">
                                        <video src={row.mediaPreview} controls />
                                        <span className="ig-reel-label">Reel Video</span>
                                        <div className="ig-reel-video-actions">
                                          <button
                                            onClick={() => handleViewMedia(row.id)}
                                            className="ig-reel-video-view"
                                            title="View video"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                              <circle cx="12" cy="12" r="3" />
                                            </svg>
                                          </button>
                                          <button
                                            onClick={() => handleRemoveMedia(row.id)}
                                            className="ig-reel-video-close"
                                            title="Remove video"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <line x1="18" y1="6" x2="6" y2="18" />
                                              <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                      {row.thumbnailPreview && (
                                        <div className={`ig-reel-thumbnail ${row.thumbnailUrl ? 'uploaded' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <img src={row.thumbnailPreview} alt="Thumbnail" />
                                          <label htmlFor={`ig-thumbnail-upload-${row.id}`} style={{ cursor: 'pointer', marginLeft: '0.5rem', display: 'flex', alignItems: 'center' }} title="Change Thumbnail">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M12 20h9" />
                                              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                            </svg>
                                          </label>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleThumbnailUpload(row.id, e)}
                                            className="ig-media-input"
                                            id={`ig-thumbnail-upload-${row.id}`}
                                            disabled={row.thumbnailUploading}
                                            style={{ display: 'none' }}
                                          />
                                          <button
                                            onClick={() => handleRemoveThumbnail(row.id)}
                                            className="ig-reel-thumbnail-close"
                                            title="Remove thumbnail"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <line x1="18" y1="6" x2="6" y2="18" />
                                              <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : row.mediaFile?.type?.startsWith('image/') ? (
                                    <img src={row.mediaPreview} alt="Preview" />
                                  ) : (
                                    <video src={row.mediaPreview} controls />
                                  )}
                                </>
                              )}
                            

                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ig-grid-cell ig-date-cell">
                      <input
                        type="date"
                        value={row.scheduledDate}
                        onChange={(e) => handleCellEdit(row.id, 'scheduledDate', e.target.value)}
                        className="ig-date-input"
                      />
                    </div>
                    <div className="ig-grid-cell ig-time-cell">
                      <input
                        type="time"
                        value={row.scheduledTime}
                        onChange={(e) => handleCellEdit(row.id, 'scheduledTime', e.target.value)}
                        className="ig-time-input"
                      />
                    </div>
                    <div className="ig-grid-cell ig-status-cell">
                      <span className={`ig-status-badge ${getStatusClass(row.status)}`}>
                        {getStatusIcon(row.status)} {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Queue Confirmation */}
        <div className="ig-queue-confirmation">
          <h3>Step 3: Schedule & Publish</h3>
          <div className="ig-confirmation-stats">
            <div className="ig-stat-item">
              <span className="ig-stat-label">Total Posts:</span>
              <span className="ig-stat-value">{composerRows.length}</span>
            </div>
            <div className="ig-stat-item">
              <span className="ig-stat-label">With Captions:</span>
              <span className="ig-stat-value">{composerRows.filter(row => (row.caption || '').trim()).length}</span>
            </div>
            <div className="ig-stat-item">
              <span className="ig-stat-label">Ready to Schedule:</span>
              <span className="ig-stat-value">{composerRows.filter(row => row.status === 'ready').length}</span>
            </div>
            <div className="ig-stat-item">
              <span className="ig-stat-label">With Media:</span>
              <span className="ig-stat-value">{composerRows.filter(row => row.mediaFile || row.mediaPreview).length}</span>
            </div>
          </div>
          {isScheduling && (
            <div className="ig-schedule-progress">
              <div className="ig-progress-bar">
                <div
                  className="ig-progress-fill"
                  style={{ width: `${scheduleProgress}%` }}
                />
              </div>
              <span className="ig-progress-text">Scheduling Instagram posts... {Math.round(scheduleProgress)}%</span>
            </div>
          )}
          <div className="ig-confirmation-actions">
            <button
              onClick={handleScheduleAll}
              disabled={isScheduling || composerRows.filter(row => row.status === 'ready').length === 0}
              className="ig-btn ig-btn-primary ig-btn-large"
            >
              {isScheduling ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Scheduling...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12,6 12,12 16,14" />
                  </svg>
                  Schedule Ready Posts ({composerRows.filter(row => row.status === 'ready').length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Caption Modal */}
      {expandedCaption && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit Caption</h3>
              <button
                onClick={() => setExpandedCaption(null)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="caption-info">
                <p><strong>Scheduled:</strong> {expandedCaption.scheduledDate} at {expandedCaption.scheduledTime}</p>
              </div>
              <textarea
                value={expandedCaption.caption}
                onChange={(e) => setExpandedCaption(prev => ({ ...prev, caption: e.target.value }))}
                className="expanded-caption-textarea"
                rows="10"
                placeholder="Enter your caption..."
              />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setExpandedCaption(null)}
                className="ig-btn ig-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveExpandedCaption(expandedCaption.id, expandedCaption.caption)}
                className="ig-btn ig-btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {mediaPreviewModal && (
        <div className="modal-overlay">
          <div className="modal-content media-preview-modal">
            <div className="modal-header">
              <h3>Media Preview</h3>
              <button
                onClick={() => setMediaPreviewModal(null)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {mediaPreviewModal.mediaFile?.type?.startsWith('image/') || (!mediaPreviewModal.mediaFile && mediaPreviewModal.mediaPreview) ? (
                <img
                  src={mediaPreviewModal.mediaPreview}
                  alt="Media preview"
                  className="modal-media"
                />
              ) : (
                <video
                  src={mediaPreviewModal.mediaPreview}
                  controls
                  className="modal-media"
                />
              )}
              {mediaPreviewModal.caption && (
                <div className="modal-caption">
                  <h4>Caption:</h4>
                  <p>{mediaPreviewModal.caption}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setMediaPreviewModal(null)}
                className="ig-btn ig-btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IgBulkComposer; 