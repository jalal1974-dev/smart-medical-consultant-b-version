CREATE TABLE `avatar_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultationId` int NOT NULL,
	`userId` int NOT NULL,
	`transcript` text NOT NULL DEFAULT ('[]'),
	`heygenSessionId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `avatar_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blog_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`name_ar` varchar(255) NOT NULL,
	`slug_en` varchar(255) NOT NULL,
	`slug_ar` varchar(255) NOT NULL,
	`description_en` text,
	`description_ar` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_categories_slug_en_unique` UNIQUE(`slug_en`),
	CONSTRAINT `blog_categories_slug_ar_unique` UNIQUE(`slug_ar`)
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`author_id` int NOT NULL,
	`title_en` varchar(500) NOT NULL,
	`title_ar` varchar(500) NOT NULL,
	`slug_en` varchar(500) NOT NULL,
	`slug_ar` varchar(500) NOT NULL,
	`excerpt_en` text NOT NULL,
	`excerpt_ar` text NOT NULL,
	`content_en` text NOT NULL,
	`content_ar` text NOT NULL,
	`meta_description_en` varchar(500),
	`meta_description_ar` varchar(500),
	`meta_keywords_en` text,
	`meta_keywords_ar` text,
	`featured_image` varchar(500),
	`featured_image_alt` varchar(255),
	`published` boolean NOT NULL DEFAULT false,
	`published_at` timestamp,
	`views` int NOT NULL DEFAULT 0,
	`reading_time_minutes` int NOT NULL DEFAULT 5,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_en_unique` UNIQUE(`slug_en`),
	CONSTRAINT `blog_posts_slug_ar_unique` UNIQUE(`slug_ar`)
);
--> statement-breakpoint
CREATE TABLE `consultation_attached_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`record_id` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consultation_attached_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consultation_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`user_id` int NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`answered_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	`attachment_url` text,
	`attachment_mime_type` varchar(100),
	`attachment_name` varchar(255),
	CONSTRAINT `consultation_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`patientName` varchar(255) NOT NULL,
	`patientEmail` varchar(320) NOT NULL,
	`patientPhone` varchar(50),
	`symptoms` text NOT NULL,
	`medicalHistory` text,
	`medicalReports` text,
	`labResults` text,
	`xrayImages` text,
	`otherDocuments` text,
	`preferredLanguage` enum('en','ar') NOT NULL DEFAULT 'en',
	`priority` enum('routine','urgent','critical') NOT NULL DEFAULT 'routine',
	`status` enum('submitted','ai_processing','ai_processing_complete','specialist_review','doctor_reviewed','completed','follow_up') NOT NULL DEFAULT 'submitted',
	`aiAnalysis` text,
	`aiReportUrl` varchar(500),
	`aiVideoUrl` varchar(500),
	`aiAudioUrl` varchar(500),
	`aiInfographicUrl` varchar(500),
	`aiInfographicContent` text,
	`aiSlideDeckUrl` varchar(500),
	`aiSlideDeckContent` text,
	`aiMindMapUrl` varchar(500),
	`pptxReportUrl` varchar(500),
	`doctorUploadedVideoUrl` varchar(500),
	`doctorUploadedVideoTitle` varchar(255),
	`doctorUploadedVideoNote` text,
	`doctorUploadedAudioUrl` varchar(500),
	`doctorUploadedAudioTitle` varchar(255),
	`doctorUploadedAudioNote` text,
	`doctorUploadedOtherUrl` varchar(500),
	`doctorUploadedOtherTitle` varchar(255),
	`doctorUploadedOtherMimeType` varchar(100),
	`doctorUploadedOtherNote` text,
	`sentPdfToPatient` boolean NOT NULL DEFAULT false,
	`sentInfographicToPatient` boolean NOT NULL DEFAULT false,
	`sentSlidesToPatient` boolean NOT NULL DEFAULT false,
	`sentMindMapToPatient` boolean NOT NULL DEFAULT false,
	`sentPptxToPatient` boolean NOT NULL DEFAULT false,
	`sentVideoToPatient` boolean NOT NULL DEFAULT false,
	`sentAudioToPatient` boolean NOT NULL DEFAULT false,
	`sentOtherToPatient` boolean NOT NULL DEFAULT false,
	`sentToPatientAt` timestamp,
	`sentToPatientBy` int,
	`aiProcessingAttempts` int NOT NULL DEFAULT 0,
	`aiLastProcessedAt` timestamp,
	`materialsRegeneratedAt` timestamp,
	`materialsRegeneratedCount` int NOT NULL DEFAULT 0,
	`specialistApprovalStatus` enum('pending_review','approved','rejected','needs_deep_analysis') DEFAULT 'pending_review',
	`specialistNotes` text,
	`specialistRejectionReason` text,
	`doctorNotes` text,
	`aiConfidence` varchar(10),
	`aiConfidenceLabel` varchar(20),
	`aiRequiresHumanReview` boolean DEFAULT false,
	`aiDisclaimer` text,
	`doctorReviewedAt` timestamp,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`treatmentPlan` text,
	`followUpNotes` text,
	`followUpStatus` enum('pending','approved','concerns'),
	`isFree` boolean NOT NULL DEFAULT false,
	`amount` int NOT NULL DEFAULT 0,
	`paymentStatus` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`paymentId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medical_history_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`consultation_id` int,
	`patient_messages` text NOT NULL,
	`ai_questions` text NOT NULL,
	`detected_language` varchar(10) NOT NULL DEFAULT 'en',
	`is_complete` boolean NOT NULL DEFAULT false,
	`completion_reason` varchar(255),
	`collected_history` text,
	`turn_count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medical_history_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expires_at` bigint NOT NULL,
	`used_at` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `patient_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`consultationId` int,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`type` enum('report_ready','system') NOT NULL DEFAULT 'report_ready',
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patient_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `podcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titleEn` varchar(255) NOT NULL,
	`titleAr` varchar(255) NOT NULL,
	`descriptionEn` text,
	`descriptionAr` text,
	`audioUrl` varchar(500) NOT NULL,
	`thumbnailUrl` varchar(500),
	`duration` int,
	`views` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `podcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registration_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`paypal_order_id` varchar(255) NOT NULL,
	`paypal_payer_id` varchar(255),
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`consultations_granted` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `registration_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `registration_payments_paypal_order_id_unique` UNIQUE(`paypal_order_id`)
);
--> statement-breakpoint
CREATE TABLE `report_generation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`patient_name` varchar(255) NOT NULL,
	`admin_id` int NOT NULL,
	`admin_name` varchar(255) NOT NULL,
	`report_type` enum('infographic','pdf','slides','mindmap','pptx','all','upload_infographic','upload_pptx','upload_pdf','upload_slides','upload_mindmap') NOT NULL,
	`action` enum('generate','regenerate','upload') NOT NULL DEFAULT 'generate',
	`status` enum('success','failed') NOT NULL DEFAULT 'success',
	`error_message` text,
	`output_url` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_generation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`topic_id` varchar(100) NOT NULL,
	`parent_topic_id` varchar(100),
	`label` varchar(500) NOT NULL,
	`description` text,
	`research_priority` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`researched` boolean NOT NULL DEFAULT false,
	`research_content` text,
	`researched_at` timestamp,
	`researched_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `satisfaction_surveys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`user_id` int NOT NULL,
	`overall_rating` int NOT NULL,
	`ai_quality_rating` int,
	`specialist_rating` int,
	`response_time_rating` int,
	`feedback` text,
	`would_recommend` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `satisfaction_surveys_id` PRIMARY KEY(`id`),
	CONSTRAINT `satisfaction_surveys_consultation_id_unique` UNIQUE(`consultation_id`)
);
--> statement-breakpoint
CREATE TABLE `slide_generation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultation_id` int NOT NULL,
	`requested_by` int NOT NULL,
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`infographic_slides_url` varchar(500),
	`slide_deck_slides_url` varchar(500),
	`error_message` text,
	`completed_at` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `slide_generation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`consultation_id` int NOT NULL,
	`patient_name` varchar(255) NOT NULL,
	`report_type` enum('infographic','slides','pdf','mindmap','pptx') NOT NULL,
	`created_by_admin_id` int NOT NULL,
	`created_by_admin_name` varchar(255) NOT NULL,
	`expires_at` bigint NOT NULL,
	`used_at` bigint,
	`uploaded_file_url` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `upload_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `upload_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user_medical_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` varchar(500) NOT NULL,
	`file_key` varchar(500) NOT NULL,
	`file_type` varchar(100) NOT NULL,
	`file_size` int,
	`category` enum('medical_report','lab_result','xray','prescription','other') NOT NULL DEFAULT 'other',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_medical_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`username` varchar(50),
	`password_hash` varchar(255),
	`auth_method` varchar(20) DEFAULT 'oauth',
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`hasUsedFreeConsultation` boolean NOT NULL DEFAULT false,
	`subscription_type` enum('free','pay_per_case','monthly') NOT NULL DEFAULT 'free',
	`plan_type` enum('free','premium') NOT NULL DEFAULT 'free',
	`consultations_remaining` int NOT NULL DEFAULT 1,
	`free_consultations_used` int NOT NULL DEFAULT 0,
	`free_consultations_total` int NOT NULL DEFAULT 1,
	`avatar_url` varchar(500),
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`disclaimerAcknowledgedAt` timestamp,
	`lastAdminPanelVisitAt` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titleEn` varchar(255) NOT NULL,
	`titleAr` varchar(255) NOT NULL,
	`descriptionEn` text,
	`descriptionAr` text,
	`videoUrl` varchar(500) NOT NULL,
	`thumbnailUrl` varchar(500),
	`duration` int,
	`views` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`media_type` enum('video','podcast') NOT NULL,
	`media_id` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`duration` int NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`last_watched_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watch_history_id` PRIMARY KEY(`id`)
);
